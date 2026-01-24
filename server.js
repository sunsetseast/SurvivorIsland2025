import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 3000;

// ES module fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve folders for main.js and its imports
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use(express.static(__dirname)); // For index.html, styles.css, etc.

// Fallback for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Survivor Island running at http://0.0.0.0:${port}`);
});