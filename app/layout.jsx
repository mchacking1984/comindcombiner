import './globals.css';

export const metadata = {
  title: 'Morning Pulse Prompt Generator',
  description: 'Generate deep research prompts with verified market data',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
