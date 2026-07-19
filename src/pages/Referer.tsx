import React, { useEffect, useState, useMemo } from 'react';
import { Globe, ExternalLink, Search, X, ArrowLeft, Users, MapPin, MousePointer, Link2, Clock, Share2 } from 'lucide-react';
import { useProject } from '../App';

interface Event {
  timestamp: string;
  eventName: string;
  visitorId: string;
  url: string;
  referrer?: string;
  ip?: string;
  elementType?: string;
  elementText?: string;
}

interface ReferrerRow {
  source: string;
  domain: string;
  favicon: string;
  referrerUrl: string;
  visits: number;
  clicks: number;
  uniqueVisitors: number;
  uniqueIPs: number;
  lastVisited: string;
  events: Event[];
}

const KNOWN_SOURCES: Record<string, string> = {
  'facebook.com': 'Facebook',
  'twitter.com': 'Twitter',
  'x.com': 'X',
  't.co': 'Twitter',
  'linkedin.com': 'LinkedIn',
  'youtube.com': 'YouTube',
  'reddit.com': 'Reddit',
  'instagram.com': 'Instagram',
  'github.com': 'GitHub',
  'bing.com': 'Bing',
  'yahoo.com': 'Yahoo',
  'duckduckgo.com': 'DuckDuckGo',
  'pinterest.com': 'Pinterest',
  'tiktok.com': 'TikTok',
  'whatsapp.com': 'WhatsApp',
  'telegram.org': 'Telegram',
  'quora.com': 'Quora',
  'medium.com': 'Medium',
  'stackoverflow.com': 'Stack Overflow',
  'discord.com': 'Discord',
  'slack.com': 'Slack',
  'gmail.com': 'Gmail',
  'mail.google.com': 'Gmail',
  'msn.com': 'MSN',
  'baidu.com': 'Baidu',
  'yandex.com': 'Yandex',
  'ecosia.org': 'Ecosia',
};

function parseReferrer(
  referrer: string | undefined,
  projectDomain: string
): { source: string; domain: string; favicon: string } {
  if (!referrer || !referrer.trim()) {
    return { source: 'Direct / None', domain: '', favicon: '' };
  }
  try {
    const url = new URL(referrer);
    const host = url.hostname.replace(/^www\./, '');

    if (projectDomain) {
      try {
        const withProto = projectDomain.startsWith('http') ? projectDomain : `https://${projectDomain}`;
        const pd = new URL(withProto).hostname.replace(/^www\./, '');
        if (host === pd) {
          return { source: 'Internal', domain: host, favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=64` };
        }
      } catch {}
    }

    if (host.includes('google.')) {
      return { source: 'Google', domain: host, favicon: 'https://www.google.com/s2/favicons?domain=google.com&sz=64' };
    }

    const source = KNOWN_SOURCES[host] || host;
    return { source, domain: host, favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=64` };
  } catch {
    return { source: 'Direct / None', domain: '', favicon: '' };
  }
}

function Referrers() {
  const { selectedProject } = useProject();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReferrer, setSelectedReferrer] = useState<ReferrerRow | null>(null);

  useEffect(() => {
    if (!selectedProject) { setLoading(false); return; }
    setLoading(true);
    fetch(`https://api1-orpin.vercel.app/api/${selectedProject.id}/events`)
      .then(res => res.json())
      .then(data => { setEvents(data.events ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedProject]);

  const referrerList = useMemo<ReferrerRow[]>(() => {
    const map = new Map<string, {
      source: string; domain: string; favicon: string; referrerUrl: string;
      visits: number; clicks: number; lastVisited: string;
      visitors: Set<string>; ips: Set<string>; events: Event[];
    }>();

    for (const e of events) {
      const { source, domain, favicon } = parseReferrer(e.referrer, selectedProject?.domain || '');
      const key = source + '|' + (domain || 'direct');
      const existing = map.get(key);
      if (existing) {
        if (e.eventName === 'pageview') existing.visits += 1;
        if (e.eventName === 'click') existing.clicks += 1;
        existing.visitors.add(e.visitorId);
        if (e.ip) existing.ips.add(e.ip);
        if (new Date(e.timestamp) > new Date(existing.lastVisited)) existing.lastVisited = e.timestamp;
        existing.events.push(e);
      } else {
        map.set(key, {
          source, domain, favicon, referrerUrl: e.referrer || '',
          visits: e.eventName === 'pageview' ? 1 : 0,
          clicks: e.eventName === 'click' ? 1 : 0,
          lastVisited: e.timestamp,
          visitors: new Set([e.visitorId]),
          ips: new Set(e.ip ? [e.ip] : []),
          events: [e],
        });
      }
    }

    return Array.from(map.values())
      .map(r => ({
        source: r.source, domain: r.domain, favicon: r.favicon, referrerUrl: r.referrerUrl,
        visits: r.visits, clicks: r.clicks, lastVisited: r.lastVisited,
        uniqueVisitors: r.visitors.size, uniqueIPs: r.ips.size, events: r.events,
      }))
      .sort((a, b) => b.visits - a.visits || b.clicks - a.clicks);
  }, [events, selectedProject]);

  const filteredReferrers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return referrerList;
    return referrerList.filter(r =>
      r.source.toLowerCase().includes(q) || r.domain.toLowerCase().includes(q)
    );
  }, [referrerList, searchQuery]);

  const totalVisits = useMemo(() => referrerList.reduce((s, r) => s + r.visits, 0), [referrerList]);
  const maxVisits = referrerList[0]?.visits || 1;

  const getEventIcon = (eventName: string) => {
    switch (eventName) {
      case 'pageview': return <Globe className="h-5 w-5 text-blue-500 dark:text-blue-400" />;
      case 'click': return <MousePointer className="h-5 w-5 text-purple-500 dark:text-purple-400" />;
      default: return <Clock className="h-5 w-5 text-gray-500 dark:text-gray-400" />;
    }
  };

  if (!selectedProject) return null;

  // ── Detail overlay ──
  if (selectedReferrer) {
    const r = selectedReferrer;
    const sortedEvents = [...r.events].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return (
      <div className="fixed inset-0 z-[60] bg-gray-50 dark:bg-gray-950 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 sm:p-8">
          <button
            onClick={() => setSelectedReferrer(null)}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors mb-6 px-3 py-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>

          {/* Header */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-indigo-600 to-blue-500 p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {r.favicon ? (
                    <img src={r.favicon} alt={r.source} className="w-8 h-8 object-contain" />
                  ) : (
                    <Link2 className="h-7 w-7 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-white truncate">{r.source}</h1>
                  {r.domain && <p className="text-indigo-100 text-sm mt-0.5 truncate">{r.domain}</p>}
                </div>
                {r.referrerUrl && (
                  <a
                    href={r.referrerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" /> Open source
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl p-4 border border-blue-100 dark:border-blue-900/50">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">Visits</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{r.visits}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/40 rounded-xl p-4 border border-green-100 dark:border-green-900/50">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">Unique Visitors</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{r.uniqueVisitors}</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-4 border border-emerald-100 dark:border-emerald-900/50">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">Unique IPs</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{r.uniqueIPs}</p>
            </div>
            <div className="bg-rose-50 dark:bg-rose-950/40 rounded-xl p-4 border border-rose-100 dark:border-rose-900/50">
              <div className="flex items-center gap-2 mb-1">
                <MousePointer className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">Clicks</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{r.clicks}</p>
            </div>
          </div>

          {/* Events table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Events from this source</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">{sortedEvents.length} events</span>
            </div>
            {sortedEvents.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">No events from this source.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Event</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Timestamp</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Visitor</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">IP</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">URL</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedEvents.slice(0, 100).map((event, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getEventIcon(event.eventName)}
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{event.eventName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {new Date(event.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {event.visitorId.slice(0, 8)}...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {event.ip ? (
                            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-mono bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                              {event.ip}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                          {event.url}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sortedEvents.length > 100 && (
                  <p className="p-3 text-center text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800">
                    Showing first 100 of {sortedEvents.length} events
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── List view (on dashboard) ──
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 dark:border-indigo-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Share2 className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            Traffic Sources
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {referrerList.length} sources · {totalVisits} total visits
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sources..."
            className="pl-9 pr-9 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-shadow w-56"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {filteredReferrers.length === 0 ? (
        <div className="p-12 text-center">
          <Share2 className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400">
            {referrerList.length === 0 ? 'No referrer data yet.' : 'No sources match your search.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[420px] overflow-y-auto">
          {filteredReferrers.map((r, i) => {
            const barWidth = (r.visits / maxVisits) * 100;
            const pct = totalVisits > 0 ? ((r.visits / totalVisits) * 100).toFixed(1) : '0';
            return (
              <button
                key={r.source + r.domain}
                onClick={() => setSelectedReferrer(r)}
                className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group flex items-center gap-4"
              >
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono w-6 flex-shrink-0">{i + 1}</span>
                <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-100 dark:border-gray-700">
                  {r.favicon ? (
                    <img src={r.favicon} alt={r.source} className="w-5 h-5 object-contain" />
                  ) : (
                    <Link2 className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.source}</p>
                    {r.domain && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate hidden sm:inline">{r.domain}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden max-w-[200px]">
                      <div className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{pct}%</span>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-5 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {r.uniqueVisitors}</span>
                  <span className="flex items-center gap-1"><MousePointer className="h-3.5 w-3.5" /> {r.clicks}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{r.visits}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">visits</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Referrers;
