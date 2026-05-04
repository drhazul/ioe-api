import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MeController } from './me.controller';
import { MeService } from './me.service';

describe('MeController', () => {
  let controller: MeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        {
          provide: MeService,
          useValue: {
            getProfile: jest.fn(),
            getFrontMenu: jest.fn(),
            getRoleDatmodulos: jest.fn(),
            getBackendPerms: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<MeController>(MeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
