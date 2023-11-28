#!/bin/bash

rm -r lambda_package
rm lambda_package.zip

pip install \
--platform manylinux2014_aarch64 \
--target="./lambda_package" \
--implementation cp \
--python-version 3.11 \
--only-binary=:all: --upgrade \
boto3 langchain pgvector psycopg2-binary

cp -r lambda/* lambda_package
rm -r lambda_package/__pycache__

cd lambda_package
zip -r ../lambda_package.zip .

cd ..