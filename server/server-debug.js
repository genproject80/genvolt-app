// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

console.log('1. Environment loaded. JWT_SECRET exists:', !!process.env.JWT_SECRET);

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

console.log('2. Basic imports loaded');

// Import custom modules
import { connectDB } from './config/database.js';
console.log('3. Database imported');

import { logger } from './utils/logger.js';
console.log('4. Logger imported');

import { errorHandler, notFound } from './middleware/errorHandler.js';
console.log('5. Error handler imported');

// Import routes
console.log('6. About to import auth routes...');
import authRoutes from './routes/authRoutes.js';
console.log('7. Auth routes imported');

console.log('8. About to import user routes...');
import userRoutes from './routes/userRoutes.js';
console.log('9. User routes imported');

console.log('All imports successful!');