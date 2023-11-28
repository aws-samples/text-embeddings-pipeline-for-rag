// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { type Construct } from 'constructs'
import { Stack, type StackProps, aws_ec2 as ec2 } from 'aws-cdk-lib'

export class Vpc extends Stack {
  public Vpc: ec2.Vpc

  constructor (scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    this.Vpc = new ec2.Vpc(this, 'vpc', {
      ipAddresses: ec2.IpAddresses.cidr('20.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      vpcName: id,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        }
      ]
    })
  }
}
