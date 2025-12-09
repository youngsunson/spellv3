import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ১. রোলআপ লাইসেন্স প্লাগইন ইমপোর্ট করুন
import license from 'rollup-plugin-license'; 

// --- ২. লাইসেন্স হেডার লোডিং লজিক ---
// লাইসেন্স ফাইলের পাথ সেট করুন (ধরে নেওয়া হচ্ছে এটি রুট ডিরেক্টরিতে আছে)
const LICENSE_HEADER_FILE = path.resolve(__dirname, 'LICENSE_HEADER.txt');

// ফাইল সিস্টেম থেকে লাইসেন্স ব্যানার টেক্সট লোড করুন
let licenseBanner = '';
try {
    licenseBanner = fs.readFileSync(LICENSE_HEADER_FILE, 'utf-8');
    console.log('✅ License header loaded successfully from LICENSE_HEADER.txt');
} catch (error) {
    // ফাইল লোড করতে ব্যর্থ হলে, একটি সতর্কতা দেখানো হবে কিন্তু বিল্ড চলতে থাকবে।
    console.error('❌ Error loading LICENSE_HEADER.txt. Build will continue without license header.');
}
// ------------------------------------


// Check for certificates in multiple locations
function getCertificates() {
  const certLocations = [
    // Check for .crt and .key files (default office-addin-dev-certs format)
    {
      key: path.join(os.homedir(), '.office-addin-dev-certs', 'localhost.key'),
      cert: path.join(os.homedir(), '.office-addin-dev-certs', 'localhost.crt')
    },
    // Check for .pem files
    {
      key: path.join(os.homedir(), '.office-addin-dev-certs', 'localhost-key.pem'),
      cert: path.join(os.homedir(), '.office-addin-dev-certs', 'localhost.pem')
    },
    // Check in local certs folder
    {
      key: path.join(__dirname, 'certs', 'localhost.key'),
      cert: path.join(__dirname, 'certs', 'localhost.crt')
    },
    {
      key: path.join(__dirname, 'certs', 'localhost-key.pem'),
      cert: path.join(__dirname, 'certs', 'localhost.pem')
    }
  ];

  for (const location of certLocations) {
    if (fs.existsSync(location.key) && fs.existsSync(location.cert)) {
      console.log('✅ Found certificates at:', location.cert);
      return {
        key: fs.readFileSync(location.key),
        cert: fs.readFileSync(location.cert)
      };
    }
  }

  console.warn('⚠️ No certificates found. Please run: npx office-addin-dev-certs install --machine');
  return false;
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // ৩. Rollup License Plugin কনফিগারেশন:
    // লাইসেন্স ব্যানার লোড না হলে, প্লাগইনটি যুক্ত করা হবে না
    licenseBanner ? license({
      sourcemap: true,
      // শুধুমাত্র সোর্স কোডে লাইসেন্স ব্যানার যুক্ত করুন
      banner: {
        // 'ignored' স্টাইল স্বয়ংক্রিয়ভাবে /*! কমেন্ট তৈরি করে, যা বিল্ডকে সফল করবে
        // এবং Obfuscator থেকে লাইসেন্সকে বাঁচাবে।
        commentStyle: 'ignored', 
        content: licenseBanner,
      },
      // থার্ড-পার্টি ডিপেন্ডেন্সি থেকে লাইসেন্স সংক্রান্ত তথ্য সংগ্রহ করুন
      thirdParty: {
        includePrivate: true,
        output: {
          file: path.join(__dirname, 'dist', 'dependencies.txt'),
          encoding: 'utf8',
        }
      }
    }) : undefined,
  ].filter(Boolean), // undefined প্লাগইনগুলি ফিল্টার করে বাদ দেওয়া হয়েছে (যখন লাইসেন্স লোড হয় না)

  base: '/spellv3/', // GitHub Pages base path
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        commands: path.resolve(__dirname, 'commands.html')
      }
    }
  },
  publicDir: 'public',
  server: {
    port: 3000,
    host: 'localhost',
    https: getCertificates() || undefined,
    headers: {
      'Access-Control-Allow-Origin': '*'
    }
  }
});
