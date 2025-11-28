import { Bird, MapPin, Download, Bookmark, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PhoneScreenshot from "@/components/PhoneScreenshot";
import AppStore from "@/components/AppStore";
import { Link } from "react-router-dom";

const Home2 = () => {
  return (
    <div className="min-h-screen bg-white">
      <section className="relative py-12 md:py-20 md:px-20 px-4 overflow-hidden bg-gradient-to-b from-white via-emerald-50/20 to-white">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100 opacity-50"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-l from-blue-300/10 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-r from-emerald-300/10 to-transparent rounded-full blur-3xl"></div>

        <div className="relative max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="flex justify-center lg:justify-start mb-6">
                <div className="relative">
                  <div className="absolute -inset-8 bg-gradient-to-r from-emerald-300/15 to-teal-300/15 rounded-full blur-3xl"></div>
                  <Bird className="relative h-16 w-16 text-emerald-600 drop-shadow-lg" />
                </div>
              </div>
              <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
                OpenBirding
                <br />
                <span className="text-emerald-600">Mobile App</span>
              </h1>
              <p className="text-xl md:text-2xl text-slate-700 mb-6 max-w-xl mx-auto lg:mx-0">
                An intuitive way to explore birding hotspots on your mobile device.
              </p>
              <p className="text-lg text-slate-600 mb-8 max-w-xl mx-auto lg:mx-0">
                Whether traveling or birding close to home, OpenBirding makes it easy to find new birding locations.
              </p>
              <div className="flex justify-center lg:justify-start">
                <a href="/" target="_blank" rel="noopener noreferrer">
                  <AppStore className="w-[170px] h-auto" />
                </a>
              </div>
            </div>

            <div className="relative justify-center lg:justify-end hidden lg:flex">
              <PhoneScreenshot
                src="/screenshot1.jpg"
                alt="Screenshot of the OpenBirding app showing a color-coded hotspots on a map"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">See It In Action</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              Browse maps, download hotspot packs, save your favorite locations, and more.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {[
              {
                src: "/screenshot1.jpg",
                alt: "Screenshot of the OpenBirding app showing a color-coded hotspots on a map",
              },
              { src: "/screenshot2.jpg", alt: "Screenshot of the OpenBirding app showing the hotspot details dialog" },
              { src: "/screenshot3.jpg", alt: "Screenshot of the OpenBirding app showing the pack download page" },
            ].map((screenshot, index) => (
              <div key={index} className="relative flex justify-center">
                <PhoneScreenshot src={screenshot.src} alt={screenshot.alt} phoneClassName="drop-shadow-2xl" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">Features</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Everything you need to discover and explore birding hotspots.
              <br /> More features coming soon!
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-white border border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <MapPin className="h-6 w-6 text-emerald-600" />
                  </div>
                  <CardTitle className="text-slate-900 text-xl">OpenStreetMap Base Map</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-700 text-base leading-relaxed">
                  Browse birding hotspots on OpenStreetMap base map that offers better outdoor map coverage of trails,
                  dirt roads, and more.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white border border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Download className="h-6 w-6 text-emerald-600" />
                  </div>
                  <CardTitle className="text-slate-900 text-xl">Offline Hotspot Packs</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-700 text-base leading-relaxed">
                  Download hotspots in packs so they can be accessed offline. Note that base maps still require an
                  internet connection unless previously loaded for that area.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white border border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Bookmark className="h-6 w-6 text-emerald-600" />
                  </div>
                  <CardTitle className="text-slate-900 text-xl">Save Your Favorites</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-700 text-base leading-relaxed">
                  Save hotspots that you want to quickly find later for easy access to your favorite birding locations.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center p-3 bg-emerald-100 rounded-full mb-6">
            <Mail className="h-6 w-6 text-emerald-600" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Questions or Feedback?</h2>
          <p className="text-lg text-slate-600 mb-4">
            Have questions about the app or want to share feedback? We'd love to hear from you.
          </p>
          <a
            href="mailto:adam@openbirding.org"
            className="text-emerald-600 hover:text-emerald-700 font-semibold text-lg"
          >
            adam@openbirding.org
          </a>
        </div>
      </section>

      <footer className="py-8 px-4 bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto text-center">
          <Link to="/privacy-policy" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default Home2;
