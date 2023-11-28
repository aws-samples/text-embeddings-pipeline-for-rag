#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'

import { Vpc } from '../lib/vpc'
import { VectorStore } from '../lib/vector-store'
import { EmbeddingFunction } from '../lib/embedding-function'
import { SourceDatabase } from '../lib/source-database'
import { DataExtraction } from '../lib/data-extraction'
import { BastionHost } from '../lib/bastion-host'

const app = new cdk.App()
const prefix = 'text-embeddings-pipeline-'

const vpc = new Vpc(app, prefix + 'vpc', {}).Vpc

new VectorStore(app, prefix + 'vector-store', vpc, {})

const embeddingFunction = new EmbeddingFunction(
  app,
  prefix + 'embedding-function',
  vpc,
  {}
)

new BastionHost(app, prefix + 'bastion-host', vpc, {})

const sourceDatabase = new SourceDatabase(
  app,
  prefix + 'source-database',
  vpc,
  {}
)

const dataExtraction = new DataExtraction(
  app,
  prefix + 'data-extraction',
  vpc,
  embeddingFunction.S3Bucket,
  {}
)
dataExtraction.addDependency(sourceDatabase)
dataExtraction.addDependency(embeddingFunction)
