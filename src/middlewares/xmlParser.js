// src/middleware/xmlParser.js
import { parseString } from 'xml2js';

const xmlParser = (req, res, next) => {
  if (req.is('xml') || req.is('text/xml')) {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      parseString(data, { explicitArray: false }, (err, result) => {
        if (err) {
          return next(err);
        }
        req.body = result;
        next();
      });
    });
  } else {
    next();
  }
};

export default xmlParser;