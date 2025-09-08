import dotenv from 'dotenv';

// Load environment variables
const result = dotenv.config();

console.log('=== Environment Debug ===');
console.log('dotenv config result:', result);
console.log('');

console.log('Database Environment Variables:');
console.log('DB_SERVER:', process.env.DB_SERVER);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_DATABASE:', process.env.DB_DATABASE);
console.log('DB_USER:', `"${process.env.DB_USER}"`); // Quoted to show if empty
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]');
console.log('');

console.log('Other Environment Variables:');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '[SET]' : '[NOT SET]');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('');

// Show current working directory
console.log('Current working directory:', process.cwd());

// Check if .env file exists
import fs from 'fs';
import path from 'path';
const envPath = path.join(process.cwd(), '.env');
console.log('.env file exists:', fs.existsSync(envPath));
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  console.log('.env file first few lines:');
  console.log(content.split('\n').slice(0, 10).join('\n'));
}