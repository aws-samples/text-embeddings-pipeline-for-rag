// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { type Construct } from 'constructs'
import {
  Stack,
  type StackProps,
  RemovalPolicy,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_lambda as _lambda,
  aws_s3 as s3,
  aws_s3_notifications as s3Notifications,
  Duration
} from 'aws-cdk-lib'

export class EmbeddingFunction extends Stack {
  public S3Bucket: s3.Bucket

  constructor (scope: Construct, id: string, vpc: ec2.Vpc, props?: StackProps) {
    super(scope, id, props)

    // Create an S3 bucket to store the objects
    this.S3Bucket = new s3.Bucket(this, 's3-bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      bucketName: id + '-bucket'
    })

    // IAM role for Lambda
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
        resources: [
          'arn:aws:secretsmanager:' +
            this.region +
            ':' +
            this.account +
            ':secret:text-embeddings-pipeline-vector-store-*'
        ],
        actions: ['secretsmanager:GetSecretValue']
      })
    )
    // Required to get the object content from the Amazon S3 bucket
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [this.S3Bucket.bucketArn + '/*'],
        actions: ['s3:GetObject*']
      })
    )
    // Required to invoke a model in Amazon Bedrock and be part of the VPC
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: [
          'bedrock:InvokeModel',
          'ec2:*NetworkInterface',
          'ec2:DescribeNetworkInterfaces'
        ]
      })
    )

    // Create a Lambda function to convert text into embeddings
    const embeddingFunction = new _lambda.Function(this, 'embedding-function', {
      architecture: _lambda.Architecture.ARM_64,
      code: _lambda.Code.fromAsset('lambda_package.zip'),
      handler: 'embedding_function.lambda_handler',
      runtime: _lambda.Runtime.PYTHON_3_11,
      functionName: id,
      memorySize: 512,
      role: lambdaExecutionRole,
      timeout: Duration.seconds(15),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
    })

    // Event trigger for .txt files
    this.S3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3Notifications.LambdaDestination(embeddingFunction),
      {
        suffix: '.txt'
      }
    )
    // Event trigger for .csv files
    this.S3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3Notifications.LambdaDestination(embeddingFunction),
      {
        suffix: '.csv'
      }
    )
  }
}
