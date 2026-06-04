# ---------------------------------------------------------------------------
# VPC, subnets (public + private across 3 AZs), NAT, route tables.
# 1 NAT GW only (dev sizing). For prod, set one NAT per AZ.
# ---------------------------------------------------------------------------

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_vpc" "default" {
  count   = var.use_default_vpc ? 1 : 0
  default = true
}

data "aws_subnets" "default" {
  count = var.use_default_vpc ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default[0].id]
  }
}

locals {
  azs                = slice(data.aws_availability_zones.available.names, 0, 3)
  public_subnets     = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i)]     # /20
  private_subnets    = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i + 8)] # /20
  vpc_id             = var.use_default_vpc ? data.aws_vpc.default[0].id : aws_vpc.main[0].id
  vpc_cidr_block     = var.use_default_vpc ? data.aws_vpc.default[0].cidr_block : aws_vpc.main[0].cidr_block
  public_subnet_ids  = var.use_default_vpc ? slice(data.aws_subnets.default[0].ids, 0, min(3, length(data.aws_subnets.default[0].ids))) : aws_subnet.public[*].id
  private_subnet_ids = var.use_default_vpc ? local.public_subnet_ids : aws_subnet.private[*].id
}

resource "aws_vpc" "main" {
  count                = var.use_default_vpc ? 0 : 1
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = merge(local.tags, { Name = "${local.name}-vpc" })
}

resource "aws_internet_gateway" "main" {
  count  = var.use_default_vpc ? 0 : 1
  vpc_id = aws_vpc.main[0].id
  tags   = merge(local.tags, { Name = "${local.name}-igw" })
}

resource "aws_subnet" "public" {
  count                   = var.use_default_vpc ? 0 : length(local.public_subnets)
  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = local.public_subnets[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags = merge(local.tags, {
    Name = "${local.name}-public-${local.azs[count.index]}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count             = var.use_default_vpc ? 0 : length(local.private_subnets)
  vpc_id            = aws_vpc.main[0].id
  cidr_block        = local.private_subnets[count.index]
  availability_zone = local.azs[count.index]
  tags = merge(local.tags, {
    Name = "${local.name}-private-${local.azs[count.index]}"
    Tier = "private"
  })
}

resource "aws_eip" "nat" {
  count      = var.use_default_vpc ? 0 : 1
  domain     = "vpc"
  tags       = merge(local.tags, { Name = "${local.name}-nat-eip" })
  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  count         = var.use_default_vpc ? 0 : 1
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  tags          = merge(local.tags, { Name = "${local.name}-nat" })
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  count  = var.use_default_vpc ? 0 : 1
  vpc_id = aws_vpc.main[0].id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }
  tags = merge(local.tags, { Name = "${local.name}-public-rt" })
}

resource "aws_route_table" "private" {
  count  = var.use_default_vpc ? 0 : 1
  vpc_id = aws_vpc.main[0].id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[0].id
  }
  tags = merge(local.tags, { Name = "${local.name}-private-rt" })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}

# ---------------------------------------------------------------------------
# VPC Endpoints — keep S3/Secrets/ECR/Logs traffic on the AWS backbone.
# ---------------------------------------------------------------------------

resource "aws_vpc_endpoint" "s3" {
  count           = var.use_default_vpc ? 0 : 1
  vpc_id          = local.vpc_id
  service_name    = "com.amazonaws.${var.aws_region}.s3"
  route_table_ids = [aws_route_table.private[0].id]
  tags            = merge(local.tags, { Name = "${local.name}-vpce-s3" })
}

resource "aws_vpc_endpoint" "interface" {
  for_each            = var.use_default_vpc ? toset([]) : toset(["secretsmanager", "ecr.api", "ecr.dkr", "logs", "sqs", "kms"])
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.private_subnet_ids
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true
  tags                = merge(local.tags, { Name = "${local.name}-vpce-${each.key}" })
}
