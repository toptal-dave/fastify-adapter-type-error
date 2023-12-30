import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import awsLambdaFastify, { PromiseHandler } from '@fastify/aws-lambda';
import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import { Context, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@nestjs/common';

interface NestApp {
  app: NestFastifyApplication;
  instance: FastifyInstance;
}

let cachedNestApp;

async function bootstrap(): Promise<NestApp> {
  const serverOptions: FastifyServerOptions = {
    logger: (process.env.LOGGER || '0') == '1',
  };
  const instance: FastifyInstance = fastify(serverOptions);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(instance),
    {
      logger: !process.env.AWS_EXECUTION_ENV ? new Logger() : console,
    },
  );

  const CORS_OPTIONS = {
    origin: '*',
    allowedHeaders: '*',
    exposedHeaders: '*',
    credentials: false,
    methods: ['GET', 'PUT', 'OPTIONS', 'POST', 'DELETE'],
  };

  app.register(require('fastify-cors'), CORS_OPTIONS);

  app.setGlobalPrefix(process.env.API_PREFIX);

  await app.init();

  return {
    app,
    instance,
  };
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<PromiseHandler> => {
  if (!cachedNestApp) {
    const nestApp: NestApp = await bootstrap();
    cachedNestApp = awsLambdaFastify(nestApp.instance, {
      decorateRequest: true,
    });
  }

  return cachedNestApp(event, context);
};
