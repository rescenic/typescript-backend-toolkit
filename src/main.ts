import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'node:http';
import process from 'node:process';
import config from './config/config.service';
import logger, { httpLogger } from './lib/logger.service';
import redisStore from './lib/session.store';
import { extractJwt } from './middlewares/extract-jwt-schema.middleware';
import apiRoutes from './routes/routes';
import { connectDatabase } from './lib/database';

const boostrapServer = async () => {
  const app = express();

  await connectDatabase();

  app.set('trust proxy', true);

  const server = createServer(app);

  app.use(
    cors({
      origin: [config.CLIENT_SIDE_URL],
      optionsSuccessStatus: 200,
      credentials: true,
    }),
  );

  if (config.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(httpLogger);
    process.env.SET_SESSION = 'true';
  }
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(
    session({
      secret: config.JWT_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: true },
      store: redisStore,
    }),
  );

  app.use(cookieParser());

  app.use(compression());

  app.use(extractJwt);

  if (config.NODE_ENV === 'production') {
    app.use(helmet());
  }

  app.use('/api', apiRoutes);

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: Object.entries(global.__registeredQueues || {}).map(
      ([, values]) => new BullMQAdapter(values.queue),
    ),
    serverAdapter,
  });

  app.use('/admin/queues', serverAdapter.getRouter());

  server.listen(config.PORT, () => {
    logger.info(`Server is running on http://localhost:${config.PORT}`);
    logger.info(`RESTful API: http://localhost:${config.PORT}/api`);
    logger.info(`BullBoard: http://localhost:${config.PORT}/admin/queues`);
    logger.info(`Client-side url set to: ${config.CLIENT_SIDE_URL}`);
  });
};

boostrapServer().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
