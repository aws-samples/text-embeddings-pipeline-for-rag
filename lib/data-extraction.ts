// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { type Construct } from 'constructs'
import {
  Stack,
  type StackProps,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_dms as dms,
  type aws_s3 as s3
} from 'aws-cdk-lib'

export class DataExtraction extends Stack {
  constructor (
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    s3Bucket: s3.Bucket,
    props?: StackProps
  ) {
    super(scope, id, props)

    // This role is required for DMS to work
    const dmsVpcRole = new iam.Role(this, 'dms-vpc-role', {
      assumedBy: new iam.ServicePrincipal('dms.amazonaws.com'),
      roleName: 'dms-vpc-role',
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(
          this,
          'dms-vpc-management-role-policy',
          'arn:aws:iam::aws:policy/service-role/AmazonDMSVPCManagementRole'
        )
      ]
    })

    // This role is required for DMS to get secret from Secrets Manager
    const secretManagerAccessRole = new iam.Role(
      this,
      'dms-secret-manager-access-role',
      {
        assumedBy: new iam.ServicePrincipal(
          'dms.' + this.region + '.amazonaws.com'
        ),
        roleName: 'dms-secret-manager-access',
        inlinePolicies: {
          dmsSecretManagerAccess: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                resources: [
                  'arn:aws:secretsmanager:' +
                    this.region +
                    ':' +
                    this.account +
                    ':secret:text-embeddings-pipeline-source-database-*'
                ],
                actions: ['secretsmanager:GetSecretValue']
              })
            ]
          })
        }
      }
    )

    // This role is required for DMS to put object in S3
    const s3AccessRole = new iam.Role(this, 'dms-s3-access-role', {
      assumedBy: new iam.ServicePrincipal(
        'dms.' + this.region + '.amazonaws.com'
      ),
      roleName: 'dms-s3-access',
      inlinePolicies: {
        dmsS3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: [s3Bucket.bucketArn, s3Bucket.bucketArn + '/*'],
              actions: [
                's3:ListBucket',
                's3:PutObject',
                's3:PutObjectTagging',
                's3:DeleteObject'
              ]
            })
          ]
        })
      }
    })

    // Create a subnet group for the replication instance
    const replicationSubnetGroup = new dms.CfnReplicationSubnetGroup(
      this,
      'dms-subnet-group',
      {
        replicationSubnetGroupIdentifier: id,
        replicationSubnetGroupDescription:
          'Subnets that have access to source and target.',
        subnetIds: vpc.privateSubnets.map((s) => s.subnetId)
      }
    )
    replicationSubnetGroup.node.addDependency(dmsVpcRole)

    // Create a security group for the replication instance
    const replicationInstanceSecurityGroup = new ec2.SecurityGroup(
      this,
      'replication-instance-sg',
      {
        securityGroupName: id + '-replication-instance',
        vpc
      }
    )
    replicationInstanceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTcp(),
      'Allow all connection'
    )

    // Launch a replication instance in the subnet group
    const replicationInstance = new dms.CfnReplicationInstance(
      this,
      'dms-replication-instance',
      {
        replicationInstanceIdentifier: id,
        replicationInstanceClass: 'dms.t3.small',
        replicationSubnetGroupIdentifier:
          replicationSubnetGroup.replicationSubnetGroupIdentifier,
        vpcSecurityGroupIds: [replicationInstanceSecurityGroup.securityGroupId],
        publiclyAccessible: false
      }
    )
    replicationInstance.node.addDependency(dmsVpcRole)
    replicationInstance.node.addDependency(replicationSubnetGroup)

    // Source Database Endpoint
    const source = new dms.CfnEndpoint(this, 'dms-source', {
      endpointIdentifier: id + '-source',
      endpointType: 'source',
      databaseName: 'postgres',
      engineName: 'postgres',
      sslMode: 'require',

      postgreSqlSettings: {
        secretsManagerSecretId: 'text-embeddings-pipeline-source-database',
        secretsManagerAccessRoleArn: secretManagerAccessRole.roleArn
      }
    })
    source.node.addDependency(dmsVpcRole)

    // Target Endpoint
    const target = new dms.CfnEndpoint(this, 'dms-target', {
      endpointIdentifier: id + '-target',
      endpointType: 'target',
      engineName: 's3',

      s3Settings: {
        bucketName: s3Bucket.bucketName,
        serviceAccessRoleArn: s3AccessRole.roleArn
      }
    })
    target.node.addDependency(dmsVpcRole)

    // Replication Task
    new dms.CfnReplicationTask(this, 'dms-task', {
      replicationTaskIdentifier: id,
      replicationInstanceArn: replicationInstance.ref,

      migrationType: 'full-load',
      sourceEndpointArn: source.ref,
      targetEndpointArn: target.ref,
      tableMappings: JSON.stringify({
        rules: [
          {
            'rule-type': 'selection',
            'rule-id': '1',
            'rule-name': '1',
            'object-locator': {
              'schema-name': '%',
              'table-name': '%'
            },
            'rule-action': 'include'
          }
        ]
      })
    })
  }
}
