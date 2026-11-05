import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { BusinessClockService } from './business-clock.service';

@Injectable()
export class BusinessClockGuard implements CanActivate {
  constructor(private readonly clock: BusinessClockService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() === 'http') {
      const method = context.switchToHttp().getRequest().method;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
        await this.clock.assertReady();
    }
    return true;
  }
}
