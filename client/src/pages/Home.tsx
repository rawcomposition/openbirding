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
      <section className="py-20 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <Bird className="h-16 w-16 text-emerald-400" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-6">Open Birding</h1>
          <p className="text-xl text-gray-200 mb-8 max-w-2xl mx-auto">
            Discover <span className="text-emerald-400 font-semibold">open access</span> birding hotspots you can visit
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
              <Button size="lg" variant="outline">
                View Map
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gradient-to-br from-slate-800/40 via-slate-700/30 to-slate-800/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">Community Driven</h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Join thousands of birders who have contributed to our worldwide database of freely accessible locations.
            </p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
              <div className="flex-1 text-center lg:text-left">
                <h3 className="text-2xl font-semibold text-white mb-4">Open Access Birding</h3>
                <p className="text-lg text-gray-300 mb-4">
                  No fees, no permits, no restrictions — just pure birding freedom.
                </p>
                <p className="text-gray-400">Every location verified by the community for true open access.</p>
              </div>
              <div className="text-center">
                <div className="text-7xl font-bold text-emerald-400 mb-4">{openHotspots.toLocaleString()}</div>
                <div className="text-2xl font-semibold text-white">Open Hotspots</div>
                <div className="text-lg text-emerald-200 mt-1">Worldwide</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">What is Open Birding?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <MapPin className="h-6 w-6 text-emerald-400" />
                  <CardTitle className="text-white">Explore Without Barriers</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300 text-md">
                  Birding should be free and open to all. Our global map highlights places you can step into nature
                  without restrictions standing in the way.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Info className="h-6 w-6 text-emerald-400" />
                  <CardTitle className="text-white">What “Open Access” Means</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300 text-md">
                  Open access hotspots allow anyone to visit freely — no entrance fees, no permits, no required guides,
                  and no “guests only” restrictions. Just show up and bird.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Users className="h-6 w-6 text-emerald-400" />
                  <CardTitle className="text-white">Built by Birders</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300 text-md">
                  OpenBirding is powered by volunteers who share local knowledge so everyone can enjoy accessible
                  birding. It’s a community effort to keep birding open and welcoming worldwide.
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
