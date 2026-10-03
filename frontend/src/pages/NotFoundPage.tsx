import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="text-center py-16">
      <h2 className="text-4xl font-bold text-gray-300">404</h2>
      <p className="mt-4 text-lg text-gray-600">Page not found</p>
      <Link
        to="/"
        className="mt-6 inline-block px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
      >
        Go Home
      </Link>
    </div>
  );
}
