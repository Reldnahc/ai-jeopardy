import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-5.5rem)] bg-gradient-to-r from-indigo-400 to-blue-700 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-2xl p-10"
      >
        <div className="text-center">
          <h1 className="text-9xl font-extrabold text-gray-900 mb-4">404</h1>
          <h2 className="text-4xl font-bold text-gray-800 mb-6">Question Not Found</h2>
          <p className="text-xl text-gray-700 mb-8">
            The answer you're looking for seems to be in another category.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate("/")}
              className="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors duration-200"
            >
              Return Home
            </button>
            <button
              onClick={() => navigate(-1)}
              className="py-3 px-6 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded transition-colors duration-200"
            >
              Go Back
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
