const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Environment variables
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Validate required environment variables
const requiredEnvVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_TOKEN'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`Error: ${varName} is not set in environment variables`);
    process.exit(1);
  }
});

// CORS configuration
const corsOptions = {
  origin: ['https://github-login-mocha.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 600
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// GitHub OAuth route
app.post('/api/auth/github', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ message: 'Authorization code is required' });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code
      },
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (!tokenResponse.data.access_token) {
      throw new Error('Failed to obtain access token');
    }

    return res.json({
      access_token: tokenResponse.data.access_token,
      token_type: tokenResponse.data.token_type
    });
  } catch (error) {
    console.error('OAuth error:', error);
    return res.status(500).json({
      message: 'Authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get issues endpoint
app.get('/api/github/issues', async (req, res) => {
  const { owner, repo } = req.query;
  
  if (!owner || !repo) {
    return res.status(400).json({ message: 'Owner and repo are required parameters' });
  }

  try {
    console.log(`Fetching issues for ${owner}/${repo}`);
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${GITHUB_TOKEN}`,
          'User-Agent': 'GitHubIssuesTracker'
        }
      }
    );

    // Transform and sanitize the response data
    const sanitizedIssues = response.data.map(issue => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      html_url: issue.html_url,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      state: issue.state
    }));

    res.json(sanitizedIssues);
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(error.response?.status || 500).json({
      message: 'Failed to fetch issues',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create issue endpoint
app.post('/api/github/issues', async (req, res) => {
  const { owner, repo, jobTitle, companyName, workLocation, workDescription } = req.body;

  // Validate required fields
  const requiredFields = ['owner', 'repo', 'jobTitle', 'companyName', 'workLocation', 'workDescription'];
  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      message: 'Missing required fields',
      fields: missingFields
    });
  }

  // Format issue content
  const issueTitle = `Job Posting: ${jobTitle} at ${companyName}`;
  const issueBody = `
Job Title: ${jobTitle}
Company: ${companyName}
Location: ${workLocation}
Description: ${workDescription}

---
Posted: ${new Date().toISOString()}
  `.trim();

  try {
    console.log(`Creating job posting for ${owner}/${repo}`);
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        title: issueTitle,
        body: issueBody,
        labels: ['job-posting']
      },
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHubIssuesTracker'
        }
      }
    );

    // Return sanitized response
    const { id, number, html_url, created_at } = response.data;
    res.status(201).json({
      message: 'Job posting created successfully',
      issue: {
        id,
        number,
        title: issueTitle,
        html_url,
        created_at
      }
    });
  } catch (error) {
    console.error('Error creating issue:', error);
    res.status(error.response?.status || 500).json({
      message: 'Failed to create job posting',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Environment configuration:');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('GITHUB_CLIENT_ID:', GITHUB_CLIENT_ID ? '✓ Set' : '✗ Missing');
  console.log('GITHUB_CLIENT_SECRET:', GITHUB_CLIENT_SECRET ? '✓ Set' : '✗ Missing');
  console.log('GITHUB_TOKEN:', GITHUB_TOKEN ? '✓ Set' : '✗ Missing');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
