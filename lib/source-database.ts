// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { type Construct } from 'constructs'
import {
  Stack,
  type StackProps,
  aws_ec2 as ec2,
  aws_rds as rds,
  aws_iam as iam,
  aws_lambda as _lambda,
  Duration
} from 'aws-cdk-lib'
import { RetentionDays } from 'aws-cdk-lib/aws-logs'
import * as triggers from 'aws-cdk-lib/triggers'

export class SourceDatabase extends Stack {
  public Database: rds.DatabaseInstance

  constructor (scope: Construct, id: string, vpc: ec2.Vpc, props?: StackProps) {
    super(scope, id, props)

    // Security group for source database
    const securityGroup = new ec2.SecurityGroup(this, 'source-database-sg', {
      vpc,
      description: 'Allow connection to RDS PostgreSQL Database Instance',
      allowAllOutbound: true,
      disableInlineRules: true,
      securityGroupName: id
    })
    // This will add the rule as an external cloud formation construct
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow connection to RDS PostgreSQL Database Instance'
    )

    // Creates the source database. Engine version must be supported by DMS version
    this.Database = new rds.DatabaseInstance(this, 'source-database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4
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
      securityGroups: [securityGroup],
      storageType: rds.StorageType.GP3,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      vpc
    })

    const lambdaExecutionRole = new iam.Role(this, 'lambda-execution-role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: id,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        )
      ]
    })
    // Required to get the secret values from AWS Secrets Manager
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [this.Database.secret?.secretArn ?? ''],
        actions: ['secretsmanager:GetSecretValue']
      })
    )
    // Required to be part of the VPC
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: ['ec2:*NetworkInterface', 'ec2:DescribeNetworkInterfaces']
      })
    )

    // Create a Lambda function to insert sample data into the source database
    const insertSampleDataFunction = new _lambda.Function(
      this,
      'source-database-insert-sample-data-function',
      {
        architecture: _lambda.Architecture.ARM_64,
        code: _lambda.Code.fromAsset('lambda_package.zip'),
        handler: 'source_database_insert_sample_data.lambda_handler',
        runtime: _lambda.Runtime.PYTHON_3_11,
        functionName: id + '-insert-sample-data',
        memorySize: 128,
        role: lambdaExecutionRole,
        timeout: Duration.seconds(15),
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
      }
    )

    // Trigger the Lambda function above once the stack is deployed
    const functionTrigger = new triggers.Trigger(
      this,
      'source-database-insert-sample-data-trigger',
      {
        handler: insertSampleDataFunction
      }
    )
    functionTrigger.node.addDependency(this.Database)
    functionTrigger.node.addDependency(insertSampleDataFunction)
  }
}
