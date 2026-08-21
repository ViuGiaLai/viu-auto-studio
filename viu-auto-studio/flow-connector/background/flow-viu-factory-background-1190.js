// Flow Factory 1.1.8 engine + Viu project/session adapter.
// A new service-worker filename is intentional: Chromium can retain an
// imported worker graph for an unpacked extension across profile restarts.
importScripts('background.js', 'viu-factory-adapter-1186.js?rev=1190');
