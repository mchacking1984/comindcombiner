import './globals.css';

export const metadata = {
  title: 'Morning Pulse Consolidator',
  description: 'Consolidate deep research from ChatGPT, Gemini, and Claude into a formatted Substack post',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
