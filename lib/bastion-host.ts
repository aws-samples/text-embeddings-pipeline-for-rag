// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { type Construct } from 'constructs'
import { Stack, type StackProps, aws_ec2 as ec2 } from 'aws-cdk-lib'

export class BastionHost extends Stack {
  constructor (scope: Construct, id: string, vpc: ec2.Vpc, props?: StackProps) {
    super(scope, id, props)

    const securityGroup = new ec2.SecurityGroup(this, id + '-sg', {
      vpc,
      allowAllOutbound: true
    })
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access'
    )

    const instance = new ec2.Instance(this, id, {
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            deleteOnTermination: true,
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3
          })
        }
      ],
      instanceName: id,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      keyName: 'EC2DefaultKeyPair',
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64
      }),
      securityGroup,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }
    })

    instance.addUserData(
      ['sudo dnf update -y', 'sudo dnf install postgresql15 -y'].join('\n')
    )
  }
}
