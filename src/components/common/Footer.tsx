import { Link } from "react-router-dom";

export default function Footer() {
  const handleFooterNav = () => {
    window.scrollTo(0, 0);
  };

  return (
    <footer className="bg-transparent text-white py-6 mt-8 ">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* About Section */}
          <div className="flex flex-col items-center md:items-start">
            <h3 className="text-xl font-extrabold"></h3>
            <p className="mt-2 text-center md:text-left text-sm"></p>
          </div>

          {/* Links Section */}
          <div className="flex flex-col items-center">
            <h3 className="text-xl font-extrabold">Quick Links</h3>
            <ul className="mt-2 space-y-2 text-sm text-center">
              <li>
                <Link to="/" className="hover:underline" onClick={handleFooterNav}>
                  Home
                </Link>
              </li>
              <li>
                <Link to="/recent-boards" className="hover:underline" onClick={handleFooterNav}>
                  Recent Boards
                </Link>
              </li>
              <li>
                <Link to="/leaderboards" className="hover:underline" onClick={handleFooterNav}>
                  Leaderboards
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Section */}
          <div className="flex flex-col items-center md:items-end">
            <h3 className="text-xl font-extrabold">Contact Us</h3>
            <p className="mt-2 text-center md:text-right text-sm">Discord coming soon!</p>
          </div>
        </div>

        {/* Footer Bottom Section */}
        <div className="mt-8 text-center border-t border-gray-200 pt-4">
          <p className="text-xs text-gray-100 font-light">
            (c) {new Date().getFullYear()} AI Jeopardy. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
