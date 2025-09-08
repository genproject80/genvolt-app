// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

console.log('Environment loaded. JWT_SECRET exists:', !!process.env.JWT_SECRET);

// Try importing JWT utils
try {
  console.log('Attempting to import JWT utils...');
  const { generateAccessToken } = await import('./utils/jwt.js');
  console.log('JWT utils imported successfully');
} catch (error) {
  console.error('Failed to import JWT utils:', error.message);
}