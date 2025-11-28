const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-8">Privacy Policy</h1>
        <div className="prose prose-slate max-w-none">
          <p className="text-sm text-slate-500 mb-8">Last Updated: November 2025</p>

          <p className="text-lg text-slate-700 mb-8">
            OpenBirding ("the App") is designed to operate with minimal data collection. This policy describes the types
            of information the App may use and how it is handled.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">1. Information the App Uses</h2>

          <h3 className="text-xl font-medium text-slate-800 mt-6 mb-3">Location (When In Use)</h3>
          <p className="text-slate-700 mb-4">
            The App may access your device's location to display your position on the map and to help identify nearby
            hotspots.
          </p>
          <p className="text-slate-700 mb-6">
            Location information is processed on your device and is not transmitted to OpenBirding servers.
          </p>

          <h3 className="text-xl font-medium text-slate-800 mt-6 mb-3">Saved Hotspots & Notes</h3>
          <p className="text-slate-700 mb-4">Users may save hotspots and add optional notes.</p>
          <p className="text-slate-700 mb-6">
            This information is stored on the device and is not sent to OpenBirding's servers.
          </p>

          <h3 className="text-xl font-medium text-slate-800 mt-6 mb-3">Downloaded Hotspot Packs</h3>
          <p className="text-slate-700 mb-4">The App may download regional hotspot data packs.</p>
          <p className="text-slate-700 mb-6">
            These downloads do not contain personal information and are stored on the device.
          </p>

          <h3 className="text-xl font-medium text-slate-800 mt-6 mb-3">Preferences</h3>
          <p className="text-slate-700 mb-6">
            The App may store user preferences such as map view or navigation settings locally on the device.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">2. Data Sharing</h2>
          <p className="text-slate-700 mb-4">The App does not collect personal information.</p>
          <p className="text-slate-700 mb-6">
            Network requests may occur—for example, to download hotspot packs or load map tiles—but these requests do
            not include personal identifiers.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">3. Data Storage</h2>
          <p className="text-slate-700 mb-4">Data used or created by the App is stored on the user's device.</p>
          <p className="text-slate-700 mb-6">
            Stored data may be removed by deleting it within the App or uninstalling the App.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">4. Children's Privacy</h2>
          <p className="text-slate-700 mb-4">The App does not require an account or collect personal information.</p>
          <p className="text-slate-700 mb-6">It is not designed to knowingly collect data from children under 13.</p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">5. Changes to This Policy</h2>
          <p className="text-slate-700 mb-6">
            We may update this Privacy Policy as the App evolves. Updates will be reflected on this page.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">6. Contact</h2>
          <p className="text-slate-700 mb-6">
            For questions about this Privacy Policy, please contact:{" "}
            <a href="mailto:adam@openbirding.org" className="text-emerald-600 hover:text-emerald-700 transition-colors">
              adam@openbirding.org
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
