import { Bird, MapPin, Users, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import PlaceSearch from "@/components/PlaceSearch";

interface WorldStats {
  hotspotCount: number;
  openHotspotCount: number;
  reviewedHotspotCount: number;
}

const Home = () => {
  const { data: worldStats } = useQuery<WorldStats>({
    queryKey: [`/regions/world/stats`],
    refetchOnWindowFocus: false,
  });

  const openHotspots = worldStats?.openHotspotCount || 0;

  return (
    <div className="min-h-screen">
      <section className="relative py-20 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100"></div>
        <div className="absolute inset-0 bg-gradient-to-tl from-blue-50/40 via-transparent to-teal-50/40"></div>
        <div className="absolute top-1/3 left-0 w-72 h-72 bg-gradient-to-r from-emerald-300/25 to-transparent rounded-full blur-2xl"></div>
        <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-gradient-to-l from-blue-300/20 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute top-0 right-1/3 w-64 h-64 bg-gradient-to-br from-teal-200/30 to-transparent rounded-full blur-xl"></div>
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-gradient-to-tr from-emerald-200/20 to-blue-200/20 rounded-full blur-2xl"></div>

        <div className="relative max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 -inset-8 bg-gradient-to-r from-emerald-300/15 to-teal-300/15 rounded-full blur-3xl"></div>
              <Bird className="relative h-16 w-16 text-emerald-600 drop-shadow-lg" />
            </div>
          </div>
          <h1 className="text-5xl font-bold text-slate-900 mb-6">OpenBirding</h1>
          <p className="text-xl text-slate-700 mb-8 max-w-2xl mx-auto">
            Discover <span className="text-emerald-600 font-semibold">open access</span> birding hotspots you can visit
            freely — without fees, permits, guides, or other restrictions — contributed and verified by the birding
            community.
          </p>

          <div className="max-w-md mx-auto mb-8">
            <PlaceSearch pill />
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/region/world">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700">
                Explore Regions
              </Button>
            </Link>
            <Link to="/map">
              <Button size="lg" variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50">
                View Map
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gradient-to-br from-slate-100/60 via-slate-50/40 to-slate-100/60">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Community Driven</h2>
            <p className="text-xl text-slate-700 max-w-3xl mx-auto">
              Join thousands of birders who have contributed to our worldwide database of freely accessible locations.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
              <div className="flex-1 text-center lg:text-left">
                <h3 className="text-2xl font-semibold text-slate-900 mb-4">Open Access Birding</h3>
                <p className="text-lg text-slate-700 mb-4">
                  No fees, no permits, no restrictions — just pure birding freedom.
                </p>
                <p className="text-slate-600">Every location verified by the community for true open access.</p>
              </div>
              <div className="text-center">
                <div className="text-7xl font-bold text-emerald-600 mb-4">{openHotspots.toLocaleString()}</div>
                <div className="text-2xl font-semibold text-slate-900">Open Hotspots</div>
                <div className="text-lg text-emerald-700 mt-1">Worldwide</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">What is OpenBirding?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-white border border-slate-200">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <MapPin className="h-6 w-6 text-emerald-600" />
                  <CardTitle className="text-slate-900">Explore Without Barriers</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-700 text-md">
                  Birding should be free and open to all. Our global map highlights places you can step into nature
                  without restrictions standing in the way.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white border border-slate-200">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Info className="h-6 w-6 text-emerald-600" />
                  <CardTitle className="text-slate-900">What "Open Access" Means</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-700 text-md">
                  Open access hotspots allow anyone to visit freely — no entrance fees, no permits, no required guides,
                  and no "guests only" restrictions. Just show up and bird.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white border border-slate-200">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Users className="h-6 w-6 text-emerald-600" />
                  <CardTitle className="text-slate-900">Built by Birders</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-700 text-md">
                  OpenBirding is powered by volunteers who share local knowledge so everyone can enjoy accessible
                  birding. It's a community effort to keep birding open and welcoming worldwide.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
