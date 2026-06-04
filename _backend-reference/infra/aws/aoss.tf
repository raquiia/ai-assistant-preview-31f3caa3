# ---------------------------------------------------------------------------
# OpenSearch Serverless — VECTORSEARCH collection for RAG embeddings.
# Three policies are required before the collection can be created:
# encryption, network, data access.
# ---------------------------------------------------------------------------

resource "aws_opensearchserverless_security_policy" "encryption" {
  name = "${local.name}-vec-enc"
  type = "encryption"
  policy = jsonencode({
    Rules = [{
      ResourceType = "collection"
      Resource     = ["collection/${local.name}-vectors"]
    }]
    AWSOwnedKey = true
  })
}

resource "aws_opensearchserverless_security_policy" "network" {
  name = "${local.name}-vec-net"
  type = "network"
  policy = jsonencode([{
    Rules = [
      {
        ResourceType = "collection"
        Resource     = ["collection/${local.name}-vectors"]
      },
      {
        ResourceType = "dashboard"
        Resource     = ["collection/${local.name}-vectors"]
      }
    ]
    AllowFromPublic = false
    SourceVPCEs     = [aws_opensearchserverless_vpc_endpoint.main.id]
  }])
}

resource "aws_opensearchserverless_vpc_endpoint" "main" {
  name               = "${local.name}-vec-vpce"
  vpc_id             = local.vpc_id
  subnet_ids         = local.private_subnet_ids
  security_group_ids = [aws_security_group.aoss.id]
}

resource "aws_opensearchserverless_access_policy" "data" {
  name = "${local.name}-vec-data"
  type = "data"
  policy = jsonencode([{
    Rules = [
      {
        ResourceType = "collection"
        Resource     = ["collection/${local.name}-vectors"]
        Permission   = ["aoss:DescribeCollectionItems", "aoss:CreateCollectionItems", "aoss:UpdateCollectionItems"]
      },
      {
        ResourceType = "index"
        Resource     = ["index/${local.name}-vectors/*"]
        Permission   = ["aoss:*"]
      }
    ]
    Principal = [
      aws_iam_role.task_role_api.arn,
      aws_iam_role.task_role_worker.arn,
    ]
  }])
}

resource "aws_opensearchserverless_collection" "vectors" {
  name = "${local.name}-vectors"
  type = "VECTORSEARCH"
  tags = local.tags

  depends_on = [
    aws_opensearchserverless_security_policy.encryption,
    aws_opensearchserverless_security_policy.network,
    aws_opensearchserverless_access_policy.data,
  ]
}
