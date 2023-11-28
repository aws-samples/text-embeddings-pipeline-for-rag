# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import psycopg2
import boto3
from botocore.exceptions import ClientError

def lambda_handler(event, context):
    # Retrieve database credentials from AWS Secrets Manager
    db_credential = get_db_credential()
    
    # Create a connection to the database and a cursor
    conn = psycopg2.connect(dbname=db_credential["username"], user=db_credential["username"], password=db_credential["password"], host=db_credential["host"], port=int(db_credential["port"]))
    cur = conn.cursor()
    
    # Create table and insert sample data
    cur.execute("CREATE TABLE faqs (question VARCHAR(250), answer VARCHAR(2000));")
    cur.execute("INSERT INTO faqs (question, answer) VALUES (%s, %s)", ("What is text embeddings pipeline?", "Text embeddings pipeline allows you to create embeddings of your contextual knowledge and store it in a vector store."))
    conn.commit()

    # Close cursor and connection
    cur.close()
    conn.close()

def get_db_credential():
    secret_name = "text-embeddings-pipeline-source-database"

    # Create a Secrets Manager client
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager'
    )

    try:
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
    except ClientError as e:
        # For a list of exceptions thrown, see
        # https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
        raise e

    # Decrypts secret using the associated KMS key.
    return json.loads(get_secret_value_response['SecretString'])