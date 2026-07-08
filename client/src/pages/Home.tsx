import { useEffect } from "react";
import {
  MapPin,
  Download,
  Bookmark,
  Mail,
  Sunrise,
  Star,
  Navigation,
  Binoculars,
  Search,
  Route,
  ArrowRight,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import Logo from "@/components/Logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PhoneScreenshot from "@/components/PhoneScreenshot";
import AppStore from "@/components/AppStore";
import HexHeatmap from "@/components/home/HexHeatmap";
import BirdFinderPreview from "@/components/home/BirdFinderPreview";
import { MARKER_COLORS } from "@/lib/liferColors";
import { Link } from "react-router-dom";

const BulletList = ({ bullets }: { bullets: { icon: LucideIcon; text: string }[] }) => (
  <ul className="space-y-3">
    {bullets.map(({ icon: Icon, text }) => (
      <li key={text} className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-emerald-100 p-1.5">
          <Icon className="h-4 w-4 text-emerald-600" />
        </span>
        <span className="text-slate-700">{text}</span>
      </li>
    ))}
  </ul>
);

const birdPlanBullets: { icon: LucideIcon; text: string }[] = [
  { icon: MapPin, text: "Save hotspots and drop custom markers" },
  { icon: Search, text: "Find target species for your trip" },
  { icon: Route, text: "Build a day-by-day itinerary and share it" },
];

const Home2 = () => {
  useEffect(() => {
    document.title = "OpenBirding";
  }, []);
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
                  <Logo className="relative h-16 w-16" />
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
              <div className="flex flex-col items-center lg:items-start gap-3">
                <a
                  href="https://apps.apple.com/us/app/openbirding/id6755897167"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <AppStore className="w-[170px] h-auto" />
                </a>
                <p className="text-sm text-slate-500">
                  Android user?{" "}
                  <Link
                    to="/android"
                    className="text-emerald-600 hover:text-emerald-700 font-medium underline underline-offset-2"
                  >
                    Get notified when it's available
                  </Link>
                </p>
              </div>
            </div>

            <div className="relative justify-center lg:justify-end hidden lg:flex">
              <PhoneScreenshot
                src="/screenshot1-3.jpg"
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
                src: "/screenshot2-4.jpg",
                alt: "Screenshot of the OpenBirding app showing a color-coded hotspots on a map with a hotspot detail dialog open",
              },
              {
                src: "/screenshot3-3.jpg",
                alt: "Screenshot of the OpenBirding app showing a hotspot detail dialog open with the list of target bird species for the hotspot",
              },
              { src: "/screenshot4-3.jpg", alt: "Screenshot of the OpenBirding app showing nearby hotspot packs" },
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
                  Download hotspots in packs so they can be accessed offline.
                  <p className="text-slate-700 text-xs leading-relaxed mt-2 italic">
                    Base maps still require an internet connection unless previously loaded for that area.
                  </p>
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white border border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Bookmark className="h-6 w-6 text-emerald-600" />
                  </div>
                  <CardTitle className="text-slate-900 text-xl">Target Bird Species</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-700 text-base leading-relaxed">
                  Import your eBird life list to see target bird species for each hotspot, no internet connection
                  required.
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            <Card className="bg-white border border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Sunrise className="h-6 w-6 text-emerald-600" />
                  </div>
                  <CardTitle className="text-slate-900 text-xl">Sunrise & Sunset Times</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-700 text-base leading-relaxed">
                  View sunrise and sunset times based on your current location.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white border border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Star className="h-6 w-6 text-emerald-600" />
                  </div>
                  <CardTitle className="text-slate-900 text-xl">Save Locations</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-700 text-base leading-relaxed">
                  Save hotspots or custom locations with notes for quick access to your favorite birding spots.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white border border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Navigation className="h-6 w-6 text-emerald-600" />
                  </div>
                  <CardTitle className="text-slate-900 text-xl">Get Directions</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-700 text-base leading-relaxed">
                  Quickly get directions to any location using your preferred navigation app — Google Maps, Apple Maps,
                  Waze, or Organic Maps.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-gradient-to-b from-white via-emerald-50/30 to-white py-20 px-4">
        <div className="absolute top-1/3 left-0 h-96 w-96 rounded-full bg-gradient-to-r from-emerald-300/10 to-transparent blur-3xl"></div>
        <div className="relative max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-emerald-100 text-emerald-700 border-transparent">Free web tools</Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">More Ways to Find Birds</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Beyond the app, OpenBirding is a growing suite of free tools — right in your browser, no account required.
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
            <Card className="flex flex-col gap-0 border border-slate-200 bg-white p-6 shadow-lg transition-shadow hover:shadow-xl">
              <div className="flex flex-1 flex-col justify-center rounded-xl border border-slate-100 bg-slate-50/60 p-5">
                <HexHeatmap className="mx-auto w-full max-w-[16rem]" />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-500">Fewer</span>
                  <div
                    className="h-2 flex-1 rounded-full"
                    style={{ background: `linear-gradient(to right, ${MARKER_COLORS.join(", ")})` }}
                  ></div>
                  <span className="text-xs font-medium text-slate-500">More lifers</span>
                </div>
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="rounded-lg bg-emerald-100 p-2">
                    <Binoculars className="h-5 w-5 text-emerald-600" />
                  </span>
                  <h3 className="text-xl font-bold text-slate-900">Best Hotspots</h3>
                </div>
                <p className="mb-5 text-slate-600">
                  Upload your eBird life list to see a color-coded map of where the most life birds await.
                </p>
                <Button asChild variant="primary" className="self-start">
                  <Link to="/best-hotspots">
                    Open Best Hotspots
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>

            <Card className="flex flex-col gap-0 border border-slate-200 bg-white p-6 shadow-lg transition-shadow hover:shadow-xl">
              <div className="flex flex-1 flex-col justify-center rounded-xl border border-slate-100 bg-slate-50/60 p-5">
                <BirdFinderPreview className="mx-auto w-full max-w-[18rem]" />
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="rounded-lg bg-emerald-100 p-2">
                    <Search className="h-5 w-5 text-emerald-600" />
                  </span>
                  <h3 className="text-xl font-bold text-slate-900">Bird Finder</h3>
                </div>
                <p className="mb-5 text-slate-600">
                  Search any species and get a ranked list of the hotspots where it's reported most often.
                </p>
                <Button asChild variant="primary" className="self-start">
                  <Link to="/bird-finder">
                    Open Bird Finder
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-slate-100 text-slate-600 border-transparent">Part of a bigger ecosystem</Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">Built by Birders, for Birders</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              OpenBirding is part of a growing family of projects for the birding community.
            </p>
          </div>

          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="relative">
              <div className="absolute -inset-6 rounded-full bg-gradient-to-br from-sky-300/20 to-blue-300/20 blur-3xl"></div>
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <img
                  src="/birdplan-banner.jpg"
                  alt="The BirdPlan.app logo above a trip map dotted with color-coded birding hotspots"
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-700">Trip Planner</div>
              <h3 className="mb-4 text-2xl md:text-3xl font-bold text-slate-900">Plan your next birding trip</h3>
              <p className="mb-6 text-lg text-slate-600">
                BirdPlan.app is the easiest way to map out multi-stop birding adventures — right from your browser.
              </p>
              <BulletList bullets={birdPlanBullets} />
              <Button asChild variant="primary" size="lg" className="mt-8">
                <a href="https://birdplan.app" target="_blank" rel="noreferrer">
                  Open BirdPlan.app
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          <div className="mt-28 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="lg:order-2">
              <div className="relative">
                <div className="absolute -inset-6 rounded-full bg-gradient-to-br from-amber-300/25 to-orange-300/25 blur-3xl"></div>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-xl">
                  <img
                    src="/caracara.jpg"
                    alt="A Crested Caracara perched atop a saguaro cactus"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                    Crested Caracara · via Avicommons
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:order-1">
              <div className="mb-5 flex items-center gap-3">
                <img src="/cc-logo.png" alt="Creative Commons" className="h-10 w-10" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">For developers</div>
                  <h3 className="text-2xl md:text-3xl font-bold text-slate-900">Avicommons</h3>
                </div>
              </div>
              <p className="mb-6 text-lg text-slate-600">
                Building a birding app of your own? Avicommons is a curated library of openly-licensed bird photos and
                thumbnails you can drop straight into your project.
              </p>
              <Button asChild variant="primary" size="lg">
                <a href="https://avicommons.org/" target="_blank" rel="noreferrer">
                  Browse Avicommons
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
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
          <span className="text-slate-600 mx-2">•</span>
          <Link
            to="https://github.com/rawcomposition/openbirding-rn"
            className="text-slate-600 hover:text-slate-900 text-sm transition-colors"
            target="_blank"
          >
            Github
          </Link>
          <span className="text-slate-600 mx-2">•</span>
          <Link
            to="https://ko-fi.com/rawcomposition"
            className="text-slate-600 hover:text-slate-900 text-sm transition-colors"
            target="_blank"
          >
            Support
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default Home2;
