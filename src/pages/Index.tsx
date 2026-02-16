import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Plus, Users, Search, PackagePlus, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


import { LoginArea } from "@/components/auth/LoginArea";
import { FollowPackCard } from "@/components/FollowPackCard";
import { CreatePackDialog } from "@/components/CreatePackDialog";
import { useFollowPacks, useUserFollowPacks } from "@/hooks/useFollowPacks";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserFollowList } from "@/hooks/useUserFollowList";

function PackGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl shadow-sm overflow-hidden border border-border/50 animate-pulse">
          <div className="h-32 bg-muted" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <div className="flex items-center gap-2">
              <Skeleton className="w-5 h-5 rounded-full" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <div className="flex -space-x-2 mt-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="w-8 h-8 rounded-full border-2 border-background" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const Index = () => {
  const { user } = useCurrentUser();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<string>("all");

  // React to URL tab param changes
  useEffect(() => {
    if (tabFromUrl && user) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, user]);
  const [searchFilter, setSearchFilter] = useState("");

  const { data: allPacks = [], isLoading: loadingAll } = useFollowPacks(100);
  const { data: myPacks = [], isLoading: loadingMy } = useUserFollowPacks(user?.pubkey);
  const { data: myFollowList = [] } = useUserFollowList(user?.pubkey);

  useSeoMeta({
    title: "Follow Packs — Nostr Follow Packs",
    description:
      "Discover and share curated lists of Nostr users to follow. Find the users that are most interesting to you or create your own lists.",
  });

  const packsImIn = useMemo(
    () => (user ? allPacks.filter((pack) => pack.pubkeys.includes(user.pubkey)) : []),
    [allPacks, user],
  );

  const packsFromFollowing = useMemo(
    () => (myFollowList.length > 0 ? allPacks.filter((pack) => myFollowList.includes(pack.author)) : []),
    [allPacks, myFollowList],
  );

  const displayPacks =
    activeTab === "mine"
      ? myPacks
      : activeTab === "in"
        ? packsImIn
        : activeTab === "following"
          ? packsFromFollowing
          : allPacks;

  const filteredPacks = searchFilter.trim()
    ? displayPacks.filter(
        (pack) =>
          pack.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
          pack.description.toLowerCase().includes(searchFilter.toLowerCase()),
      )
    : displayPacks;

  const isLoading = activeTab === "mine" ? loadingMy : loadingAll;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/15 transition-colors">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">Follow Packs</span>
          </a>

          <LoginArea className="max-w-60" />
        </div>
      </header>

      <main className="flex-1">
        {/* Hero section */}
        <div className="relative isolate overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/8 via-primary/3 to-transparent" />
          <div className="absolute top-0 right-0 w-96 h-96 -z-10 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />

          <div className="max-w-6xl mx-auto px-4 py-16 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 tracking-tight">Nostr Follow Packs</h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Discover and share curated lists of Nostr users to follow. Find the users that are most interesting to you
              or create your own lists.
            </p>

            <div className="mt-8">
              {user ? (
                <Button
                  size="lg"
                  onClick={() => setCreateOpen(true)}
                  className="rounded-full px-8 text-base h-12 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
                >
                  <PackagePlus className="w-5 h-5 mr-2" />
                  Create New Follow Pack
                </Button>
              ) : (
                <div className="space-y-3">
                  <Button size="lg" disabled className="rounded-full px-8 text-base h-12 opacity-50">
                    <Plus className="w-5 h-5 mr-2" />
                    Create New Follow Pack
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Please log in to create a follow pack or to follow users.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Packs section */}
        <div className="max-w-6xl mx-auto px-4 pb-16">
          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="lg" className="rounded-full bg-card gap-2 text-base px-6 h-12">
                  {activeTab === "all" ? "All Packs" : activeTab === "mine" ? "My Packs" : activeTab === "in" ? "Packs I'm In" : "From People I Follow"}
                  <ChevronDown className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem className="text-base py-2.5" onClick={() => setActiveTab("all")}>
                  All Packs
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!user}
                  onClick={() => user && setActiveTab("mine")}
                  className={`text-base py-2.5 ${!user ? "opacity-50" : ""}`}
                >
                  My Packs
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!user}
                  onClick={() => user && setActiveTab("in")}
                  className={`text-base py-2.5 ${!user ? "opacity-50" : ""}`}
                >
                  Packs I'm In
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!user}
                  onClick={() => user && setActiveTab("following")}
                  className={`text-base py-2.5 ${!user ? "opacity-50" : ""}`}
                >
                  From People I Follow
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative sm:ml-auto w-full sm:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search packs..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-11 rounded-full bg-card h-12 text-base"
              />
            </div>
          </div>

          {/* Grid */}
          {isLoading ? (
            <PackGridSkeleton />
          ) : filteredPacks.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                {activeTab === "mine"
                  ? "No follow packs yet"
                  : activeTab === "in"
                    ? "You're not in any packs yet"
                    : activeTab === "following"
                      ? "No packs from people you follow"
                      : "No packs found"}
              </h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                {activeTab === "mine"
                  ? "You haven't created any follow packs. Create one to get started!"
                  : activeTab === "in"
                    ? "You haven't been added to any follow packs yet."
                    : activeTab === "following"
                      ? "People you follow haven't created any packs yet."
                      : searchFilter
                        ? "Try adjusting your search terms."
                        : "Be the first to create a follow pack!"}
              </p>
              {activeTab === "mine" && user && (
                <Button onClick={() => setCreateOpen(true)} className="mt-4 rounded-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Pack
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPacks.map((pack) => (
                <FollowPackCard key={`${pack.author}:${pack.dTag}`} pack={pack} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Follow Packs</span> - Made with love by{" "}
            <a
              href="https://neo21.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Neo
            </a>
          </p>
        </div>
      </footer>

      {/* Create dialog */}
      <CreatePackDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
};

export default Index;
