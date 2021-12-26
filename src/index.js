import fs from 'fs';
import http from 'http';
import https from 'https';
import cors from 'cors';
import tcpPortUsed from 'tcp-port-used';
import express from 'express';
import bodyParser from "body-parser";
import expressPinoLogger from "express-pino-logger";
import { logger } from './utils/logger.js';
import { apiBaseUrl, mailFrom, mailSubject } from './config.js';
import date from 'date-and-time';
import {sendMail} from './utils/mail.js';
import dotenv from 'dotenv';
import sleep from 'sleep-promise';
dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(expressPinoLogger({ logger: logger }));
setCors(app);

let credentials = null;
let isHttps = process.env.isHttps * 1 === 1;
const httpsPort = process.env.httpsPort * 1;
const httpPort = process.env.httpPort * 1;
const doubleCheckInterval = process.env.DoubleCheckInterval;
const mailTo = process.env.mailTo;

if(isHttps) {
  const privateKey  = fs.readFileSync('sslcert/server.key', 'utf8');
  const certificate = fs.readFileSync('sslcert/server.pem', 'utf8');
  credentials = {key: privateKey, cert: certificate};
}

app.get(apiBaseUrl + '/test', function (req, res) {
	res.send('Hello World!');
})

function setCors(app) {
  const whitelist = [
    'http://127.0.0.1:3000', 
    'http://localhost:3000', 
    'http://app.gamex.plus',
    'https://app.gamex.plus',
  ];
  const origin = function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  };
  app.use(cors({
      origin,
      maxAge: 5,
      credentials: true,
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
      exposeHeaders: ['WWW-Authenticate', 'Server-Authorization'],
    })
  )
}

setInterval(async () => {
	console.log('setInterval start');
	const res = await checkConnection(process.env.IPS, process.env.PORTS);
	let message = [];
	if(res.success) {
		for(let i = 0; i < res.data.length; i++) {
			const d = res.data[i];
			if(!d.inUse) message.push(d);
		}
		if(message.length > 0) {
      console.log("有疑似节点问题", JSON.stringify(message));
      console.log(`等待${doubleCheckInterval}秒, 再次确认`);
      await sleep(doubleCheckInterval * 1000);
      await doubleCheck(message);
    } else console.log(getDate() + " All ports are available");
	}
}, 60000 * process.env.Interval);

const doubleCheck = async (data) => {
  let ips = [];
  let ports = [];
  console.log('开始再次确认');
  for(let i = 0; i < data.length; i++) {
    if(!ips.includes(data[i].ip)) ips.push(data[i].ip); 
    if(!ports.includes(data[i].port)) ports.push(data[i].port);
  }
  ips = ips.join(',');
  ports = ports.join(',');
  const res = await checkConnection(ips, ports);
  let message = [];
  if(res.success) {
    for(let i = 0; i < res.data.length; i++) {
      const d = res.data[i];
      if(!d.inUse) message.push(d);
    }
    if(message.length > 0) {
      console.log('再次确认后, 确认节点问题', JSON.stringify(message));
      await sendMail(mailFrom, mailTo, mailSubject, "Node error " + JSON.stringify(message));
    } else {
      console.log('再次确认, 排除疑似故障');
    }
  }
}

const getDate = () => {
	return date.format(new Date(), 'YYYY/MM/DD HH:mm:ss');
}

// sendMail(mailFrom, mailTo, mailSubject, getDate() + ' XX网络节点监控已经启动，每十分钟检测一次，如发现故障，会收到邮件通知！');

app.post(apiBaseUrl + '/checkport', async function (req, res) {
  const ips = req.body.ips;
  const ports = req.body.ports;

  if(ips === '' || ports === '' || ips === undefined || ports === undefined) res.send({success:false});
	res.send(await checkConnection(ips, ports));
})

const checkConnection = async (ips, ports) => {
  const ipArray = ips.split(',');
  const portArray = ports.split(',');
  let re = [];
  // console.log(ipArray, portArray)
  for(let i = 0; i < ipArray.length; i++) {
    for(let j = 0; j < portArray.length; j++) {
      try{
        const inUse = await tcpPortUsed.check(parseInt(portArray[j]), ipArray[i]);
        re.push({
          ip: ipArray[i],
          port: parseInt(portArray[j]),
          inUse,
        })
      } catch (e) {
        continue;
      }
    }
  }  
	return {success: true, data: re};
}

if(isHttps) {
  const httpsServer = https.createServer(credentials, app);
  httpsServer.listen(httpsPort, function () {
    logger.info(`xxnetwork api has started on https port ${httpsPort}.`);
  })  
}

const httpServer = http.createServer(app);
httpServer.listen(httpPort, function () {
  logger.info(`xxnetwork api has started on http port ${httpPort}.`);
})
