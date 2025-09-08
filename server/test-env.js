import dotenv from 'dotenv';
dotenv.config();

console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
console.log('JWT_SECRET value (first 10 chars):', process.env.JWT_SECRET?.substring(0, 10));
console.log('All env vars starting with JWT:', 
  Object.keys(process.env)
    .filter(key => key.startsWith('JWT'))
    .map(key => `${key}=${process.env[key]?.substring(0, 10)}...`)
);