// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { type Construct } from 'constructs'
import {
  Stack,
  type StackProps,
  aws_ec2 as ec2,
  aws_rds as rds,
  Duration
} from 'aws-cdk-lib'
import { RetentionDays } from 'aws-cdk-lib/aws-logs'

export class VectorStore extends Stack {
  public VectorStore: rds.DatabaseInstance

  constructor (scope: Construct, id: string, vpc: ec2.Vpc, props?: StackProps) {
    super(scope, id, props)

    // Create a security group for the RDS PostgreSQL database instance that is used as a vector store
    const vectorStoreSg = new ec2.SecurityGroup(this, 'vector-store-sg', {
      vpc,
      description: 'Allow connection to RDS PostgreSQL Database Instance',
      allowAllOutbound: true,
      disableInlineRules: true,
      securityGroupName: id
    })
    // This will add the rule as an external cloud formation construct
    vectorStoreSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow connection to RDS PostgreSQL Database Instance'
    )

    // Create an RDS PostgreSQL database instance that is used as a vector store
    this.VectorStore = new rds.DatabaseInstance(this, 'vector-store', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.of('16.1', '16')
      }),
      // Generate the secret with admin username `postgres` and random password
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        secretName: id
      }),
      allocatedStorage: 50,
      backupRetention: Duration.days(0),
      caCertificate: rds.CaCertificate.RDS_CA_RDS2048_G1,
      cloudwatchLogsRetention: RetentionDays.ONE_DAY,
      deleteAutomatedBackups: true,
      instanceIdentifier: id,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MEDIUM
      ),
      securityGroups: [vectorStoreSg],
      storageType: rds.StorageType.GP3,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      vpc
    })
  }
}
