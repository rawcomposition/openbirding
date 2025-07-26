import { Bird, MapPin, Users, Camera } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Home = () => {
  return (
    <div className="min-h-screen">
      <section className="py-20 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <Bird className="h-16 w-16 text-emerald-400" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-6">Welcome to OpenBirding</h1>
          <p className="text-xl text-gray-200 mb-8 max-w-2xl mx-auto">
            Discover, track, and share your bird watching adventures. Connect with fellow birders and explore the
            world's avian diversity.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/birds">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700">
                Explore Birds
              </Button>
            </Link>
            <Link to="/map">
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                View Map
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">Features Coming Soon</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <MapPin className="h-6 w-6 text-emerald-400" />
                  <CardTitle className="text-white">Location Tracking</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300">
                  Track your bird watching locations and share hotspots with the community.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Camera className="h-6 w-6 text-emerald-400" />
                  <CardTitle className="text-white">Photo Sharing</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300">
                  Upload and share your bird photos with identification assistance.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Users className="h-6 w-6 text-blue-400" />
                  <CardTitle className="text-white">Community</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-300">
                  Connect with fellow birders and join local bird watching groups.
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
