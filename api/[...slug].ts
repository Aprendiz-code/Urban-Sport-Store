import serverless from 'serverless-http';
import app from './src/app';

const handler = serverless(app as any);

export default async function handlerWrapper(req: any, res: any) {
  return handler(req, res);
}
