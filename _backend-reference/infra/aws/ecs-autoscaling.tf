# Wave 6.G — Auto-scaling ECS Fargate pour l'API Fastify
#
# Cible : 2 tasks min en permanence (HA inter-AZ), jusqu'à 20 en pic.
# Triggers : CPU 60% + ALB request count > 200 req/min/task.
# Cooldown généreux pour éviter le flapping pendant les bursts de chat streaming.

resource "aws_appautoscaling_target" "api" {
  max_capacity       = 20
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Scale sur CPU
resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "mp-api-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 60.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# Scale sur requêtes ALB
resource "aws_appautoscaling_policy" "api_req" {
  name               = "mp-api-req-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 200.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.api.arn_suffix}/${aws_lb_target_group.api.arn_suffix}"
    }
  }
}

# ALB Target Group — healthz path (Wave 6.G)
# (Référence ; à fusionner avec le aws_lb_target_group existant)
# health_check {
#   path                = "/healthz"
#   interval            = 15
#   timeout             = 5
#   healthy_threshold   = 2
#   unhealthy_threshold = 3
#   matcher             = "200"
# }
