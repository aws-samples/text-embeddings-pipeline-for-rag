if (Test-Path -LiteralPath "lambda_package") {
    rm lambda_package -r -force
}
rm -fo lambda_package.zip

pip install --no-user --platform manylinux2014_aarch64 --target="lambda_package" --implementation cp --python-version 3.11 --only-binary=:all: --upgrade boto3 langchain pgvector psycopg2-binary

Copy-Item -Path "lambda\*" -Destination "lambda_package" -Recurse
rm lambda_package\__pycache__ -r -force

Add-Type -Assembly "System.IO.Compression.FileSystem" ;
[System.IO.Compression.ZipFile]::CreateFromDirectory("lambda_package", "lambda_package.zip")