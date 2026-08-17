import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { demoContent, type Category, type ContentItem } from "./src/data/demo";
import { eventStatus, formatDistance, relativeTime } from "./src/lib/content";
import { MapSurface } from "./src/features/map/MapSurface";
import { supabase } from "./src/lib/supabase";
import { UntitledIcon } from "./src/components/UntitledIcon";

const queryClient = new QueryClient();
const colors = {
  ink: "#15231d",
  muted: "#6b776f",
  paper: "#fbfcf9",
  surface: "#ffffff",
  line: "#e5eae5",
  accent: "#256c4d",
  pale: "#e7f4eb",
  coral: "#e66b4d",
};
type Tab = "Map" | "Feed" | "Create" | "Explore" | "Profile";
type Coordinate = [longitude: number, latitude: number];
type Profile = {
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
};
type MapMarker = {
  id: string;
  content_type: "post" | "event";
  category: Category | null;
  longitude: number;
  latitude: number;
  title: string;
  starts_at: string;
};

function App() {
  const [onboarded, setOnboarded] = useState(true);
  const [tab, setTab] = useState<Tab>("Map");
  const [locationAllowed, setLocationAllowed] = useState<boolean | null>(null);
  const [userCoordinate, setUserCoordinate] = useState<Coordinate | null>(null);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [createKind, setCreateKind] = useState<"post" | "event" | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [publishedPosts, setPublishedPosts] = useState<ContentItem[]>([]);
  const [mapMarkers, setMapMarkers] = useState<ContentItem[]>([]);

  const content = useMemo(
    () =>
      Array.from(
        new Map(
          [...publishedPosts, ...mapMarkers, ...demoContent].map((item) => [
            item.id,
            item,
          ]),
        ).values(),
      ),
    [mapMarkers, publishedPosts],
  );

  const requestLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    const granted = permission.status === "granted";
    setLocationAllowed(granted);
    if (granted) {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserCoordinate([position.coords.longitude, position.coords.latitude]);
    }
  };
  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("username, display_name, bio, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data as Profile | null);
  };
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void loadProfile(data.session.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setProfile(null);
        if (nextSession) void loadProfile(nextSession.user.id);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!userCoordinate) return;
    const [longitude, latitude] = userCoordinate;
    const loadMarkers = async () => {
      const { data, error } = await supabase.rpc("map_viewport", {
        north: latitude + 0.12,
        south: latitude - 0.12,
        east: longitude + 0.16,
        west: longitude - 0.16,
        categories: null,
        types: null,
        max_results: 200,
      });
      if (error) return;
      const markers = data as unknown as MapMarker[];
      setMapMarkers(
        markers.map((marker) => ({
          id: marker.id,
          type: marker.content_type,
          category: marker.category ?? "other",
          title: marker.title,
          description: marker.title,
          author: "@around",
          locationName: "Nearby",
          longitude: marker.longitude,
          latitude: marker.latitude,
          distanceM: 0,
          createdAt: marker.starts_at,
          likes: 0,
          comments: 0,
        })),
      );
    };
    void loadMarkers();
  }, [userCoordinate]);
  const publishPost = async (caption: string) => {
    if (!session) throw new Error("Please sign in before publishing.");
    if (!userCoordinate)
      throw new Error("Choose your location on the map before publishing.");
    const point = `POINT(${userCoordinate[0]} ${userCoordinate[1]})`;
    const { data, error } = await supabase
      .from("posts")
      .insert({
        user_id: session.user.id,
        caption,
        location: point,
        public_location: point,
        location_name: "Current location",
        location_precision: "exact",
      })
      .select("id, created_at")
      .single();
    if (error) throw error;
    const created = data as { id: string; created_at: string };
    setPublishedPosts((current) => [
      {
        id: created.id,
        type: "post",
        category: "other",
        title: caption,
        description: caption,
        author: "@you",
        locationName: "Current location",
        longitude: userCoordinate[0],
        latitude: userCoordinate[1],
        distanceM: 0,
        createdAt: created.created_at,
        likes: 0,
        comments: 0,
      },
      ...current,
    ]);
  };
  const toggle = (
    id: string,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  ) =>
    setter((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />;

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      {tab === "Map" && (
        <MapScreen
          items={content}
          selected={selected}
          onSelect={setSelected}
          onLocation={requestLocation}
          locationAllowed={locationAllowed}
          userCoordinate={userCoordinate}
        />
      )}
      {tab === "Feed" && (
        <FeedScreen
          items={content}
          liked={liked}
          saved={saved}
          onLike={(id) => toggle(id, setLiked)}
          onSave={(id) => toggle(id, setSaved)}
          onOpen={setSelected}
        />
      )}
      {tab === "Create" &&
        (createKind === "post" ? (
          <PostCreateScreen
            userId={session?.user.id ?? null}
            userCoordinate={userCoordinate}
            onBack={() => setCreateKind(null)}
            onPublish={async (caption) => {
              await publishPost(caption);
              setCreateKind(null);
              setTab("Map");
              Alert.alert("Published", "Your post is now live around you.");
            }}
          />
        ) : (
          <CreateScreen
            kind={createKind}
            setKind={setCreateKind}
            onPublished={() => {
              setCreateKind(null);
              setTab("Map");
              Alert.alert("Published", "Your event is now live around you.");
            }}
          />
        ))}
      {tab === "Explore" && (
        <ExploreScreen items={demoContent} onOpen={setSelected} />
      )}
      {tab === "Profile" &&
        (session ? (
          <AccountProfile
            profile={profile}
            email={session.user.email ?? ""}
            saved={saved.size}
            onLogout={() => void supabase.auth.signOut()}
          />
        ) : (
          <AuthGate onBack={() => setTab("Map")} />
        ))}
      <BottomNav
        active={tab}
        onChange={(next) => {
          setSelected(null);
          setTab(next);
        }}
      />
      <DetailSheet
        item={selected}
        liked={liked}
        saved={saved}
        onClose={() => setSelected(null)}
        onLike={(id) => toggle(id, setLiked)}
        onSave={(id) => toggle(id, setSaved)}
      />
    </SafeAreaView>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [page, setPage] = useState(0);
  const pages = [
    [
      "See what’s happening around you.",
      "Live activity, events and worthwhile places — all nearby.",
    ],
    [
      "Your city, in real time.",
      "Posts and events live directly on the map, when they matter.",
    ],
    ["Explore. Share. Follow.", "Be part of what makes your city feel alive."],
  ];
  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, styles.onboard]}>
      <View style={styles.logo}>
        <Text style={styles.logoMark}>◉</Text>
        <Text style={styles.logoType}>around</Text>
      </View>
      <View style={styles.onboardBody}>
        <Text style={styles.eyebrow}>0{page + 1} / 03</Text>
        <Text style={styles.hero}>{pages[page][0]}</Text>
        <Text style={styles.lead}>{pages[page][1]}</Text>
      </View>
      <View>
        <Pressable
          style={styles.primary}
          onPress={() => (page < 2 ? setPage(page + 1) : onDone())}
        >
          <Text style={styles.primaryText}>
            {page === 2 ? "Get started" : "Continue"}
          </Text>
        </Pressable>
        <Pressable style={styles.textButton} onPress={onDone}>
          <Text style={styles.textButtonLabel}>
            {page === 2 ? "I already have an account" : "Skip for now"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function MapScreen(props: {
  items: ContentItem[];
  selected: ContentItem | null;
  onSelect: (item: ContentItem) => void;
  onLocation: () => void;
  locationAllowed: boolean | null;
  userCoordinate: Coordinate | null;
}) {
  const {
    items,
    onSelect,
    onLocation,
    locationAllowed,
    userCoordinate,
  } = props;
  return (
    <View style={styles.page}>
      <View style={styles.mapCanvas}>
        <MapSurface
          items={items}
          onSelect={onSelect}
          showUserLocation={locationAllowed === true}
          userCoordinate={userCoordinate}
        />
        <Pressable style={styles.recenter} onPress={onLocation}>
          <UntitledIcon name="navigation" size={22} color="#1A73E8" />
        </Pressable>
        {locationAllowed === false && (
          <View style={styles.permission}>
            <Text style={styles.permissionText}>
              Location is off — exploring Belgrade
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function FeedScreen({
  items,
  liked,
  saved,
  onLike,
  onSave,
  onOpen,
}: {
  items: ContentItem[];
  liked: Set<string>;
  saved: Set<string>;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onOpen: (item: ContentItem) => void;
}) {
  return (
    <View style={styles.page}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Around you</Text>
        <Text style={styles.muted}>Fresh from Belgrade</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.feed}
        renderItem={({ item }) => (
          <ContentCard
            item={item}
            liked={liked.has(item.id)}
            saved={saved.has(item.id)}
            onOpen={() => onOpen(item)}
            onLike={() => onLike(item.id)}
            onSave={() => onSave(item.id)}
          />
        )}
      />
    </View>
  );
}

function ContentCard({
  item,
  liked,
  saved,
  onOpen,
  onLike,
  onSave,
}: {
  item: ContentItem;
  liked: boolean;
  saved: boolean;
  onOpen: () => void;
  onLike: () => void;
  onSave: () => void;
}) {
  const status =
    item.type === "event" ? eventStatus(item.startAt, item.endAt) : "LIVE";
  return (
    <Pressable style={styles.card} onPress={onOpen}>
      <View style={styles.cardMeta}>
        <Text style={styles.categoryPill}>
          {item.type === "event" ? "EVENT" : "POST"}
        </Text>
        <Text style={styles.cardTime}>
          {status === "live"
            ? "LIVE NOW"
            : item.type === "post"
              ? relativeTime(item.createdAt)
              : status.replace("_", " ")}
        </Text>
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardBody} numberOfLines={2}>
        {item.description}
      </Text>
      <View style={styles.locationRow}>
        <View style={styles.iconTextRow}>
          <UntitledIcon name="pin" size={16} color={colors.muted} />
          <Text style={styles.locationText}>{item.locationName}</Text>
        </View>
        <Text>{formatDistance(item.distanceM)}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onLike}>
          <View style={styles.iconTextRow}>
            <UntitledIcon name="heart" size={18} color={liked ? colors.coral : colors.muted} />
            <Text style={liked ? styles.actionActive : styles.action}>{item.likes + (liked ? 1 : 0)}</Text>
          </View>
        </Pressable>
        <View style={styles.iconTextRow}>
          <UntitledIcon name="message" size={18} color={colors.muted} />
          <Text style={styles.action}>{item.comments}</Text>
        </View>
        <Pressable onPress={onSave}>
          <UntitledIcon name="bookmark" size={18} color={saved ? colors.accent : colors.muted} />
        </Pressable>
      </View>
    </Pressable>
  );
}

function CreateScreen({
  kind,
  setKind,
  onPublished,
}: {
  kind: "post" | "event" | null;
  setKind: (value: "post" | "event" | null) => void;
  onPublished: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  if (!kind)
    return (
      <View style={styles.createChooser}>
        <Text style={styles.screenTitle}>Share around you</Text>
        <Text style={styles.lead}>What would you like to create?</Text>
        <Pressable style={styles.choice} onPress={() => setKind("post")}>
          <UntitledIcon name="message" size={30} color={colors.accent} />
          <View>
            <Text style={styles.choiceTitle}>Live post</Text>
            <Text style={styles.muted}>
              Share something happening right now
            </Text>
          </View>
        </Pressable>
        <Pressable style={styles.choice} onPress={() => setKind("event")}>
          <UntitledIcon name="calendar" size={30} color={colors.accent} />
          <View>
            <Text style={styles.choiceTitle}>Upcoming event</Text>
            <Text style={styles.muted}>
              Bring people together at a place and time
            </Text>
          </View>
        </Pressable>
      </View>
    );
  const valid =
    kind === "event"
      ? title.trim().length > 0
      : title.trim().length > 0 || description.trim().length > 0;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.createForm}>
      <Pressable onPress={() => setKind(null)}>
        <View style={styles.backRow}><UntitledIcon name="arrowLeft" size={18} color={colors.accent} /><Text style={styles.back}>Back</Text></View>
      </Pressable>
      <Text style={styles.screenTitle}>New {kind}</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={kind === "event" ? "Event title" : "What’s happening?"}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Add a description (optional)"
        placeholderTextColor={colors.muted}
        style={[styles.input, styles.textarea]}
        multiline
      />
      <View style={styles.locationPicker}>
        <Text style={styles.fieldLabel}>LOCATION</Text>
        <View style={styles.iconTextRow}><UntitledIcon name="pin" size={17} color={colors.ink} /><Text style={styles.locationSelected}>Republic Square, Belgrade</Text></View>
        <Text style={styles.muted}>Exact location · change</Text>
      </View>
      {kind === "event" && (
        <View style={styles.locationPicker}>
          <Text style={styles.fieldLabel}>STARTS</Text>
          <Text style={styles.locationSelected}>Tomorrow · 19:00</Text>
        </View>
      )}
      <Pressable
        style={[styles.primary, !valid && styles.disabled]}
        disabled={!valid}
        onPress={onPublished}
      >
        <Text style={styles.primaryText}>Publish {kind}</Text>
      </Pressable>
    </ScrollView>
  );
}

function PostCreateScreen({
  userId,
  userCoordinate,
  onBack,
  onPublish,
}: {
  userId: string | null;
  userCoordinate: Coordinate | null;
  onBack: () => void;
  onPublish: (caption: string) => Promise<void>;
}) {
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  if (!userId) return <AuthGate onBack={onBack} />;
  const publish = async () => {
    if (!caption.trim()) return;
    setSaving(true);
    try {
      await onPublish(caption.trim());
    } catch (error) {
      Alert.alert(
        "Could not publish",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.createForm}>
      <Pressable onPress={onBack}>
        <View style={styles.backRow}><UntitledIcon name="arrowLeft" size={18} color={colors.accent} /><Text style={styles.back}>Back</Text></View>
      </Pressable>
      <Text style={styles.screenTitle}>New post</Text>
      <TextInput
        value={caption}
        onChangeText={setCaption}
        placeholder="What’s happening?"
        placeholderTextColor={colors.muted}
        style={[styles.input, styles.textarea]}
        multiline
      />
      <View style={styles.locationPicker}>
        <Text style={styles.fieldLabel}>LOCATION</Text>
        <View style={styles.iconTextRow}><UntitledIcon name="pin" size={17} color={colors.ink} /><Text style={styles.locationSelected}>{userCoordinate ? "Your current location" : "Location required"}</Text></View>
        <Text style={styles.muted}>
          {userCoordinate
            ? "Exact location"
            : "Tap the location button on Map first."}
        </Text>
      </View>
      <Pressable
        style={[
          styles.primary,
          (!caption.trim() || !userCoordinate || saving) && styles.disabled,
        ]}
        disabled={!caption.trim() || !userCoordinate || saving}
        onPress={() => void publish()}
      >
        <Text style={styles.primaryText}>
          {saving ? "Publishing…" : "Publish post"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function AuthScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [signingUp, setSigningUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      if (signingUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: username.trim().toLowerCase(),
              display_name: username.trim(),
            },
          },
        });
        if (error) throw error;
        Alert.alert(
          data.session ? "Account created" : "Check your email",
          data.session
            ? "You can now publish your post."
            : "Confirm your email, then return to Around and sign in.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      Alert.alert(
        "Could not continue",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.createForm}>
      <Pressable onPress={onBack}>
        <View style={styles.backRow}><UntitledIcon name="arrowLeft" size={18} color={colors.accent} /><Text style={styles.back}>Back</Text></View>
      </Pressable>
      <Text style={styles.screenTitle}>
        {signingUp ? "Create your account" : "Sign in to Around"}
      </Text>
      <Text style={styles.lead}>
        You need an account to publish content around you.
      </Text>
      {signingUp && (
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          placeholder="Username"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
      )}
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={signingUp ? "new-password" : "password"}
        placeholder="Password (at least 6 characters)"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Pressable
        style={[
          styles.primary,
          (!email.trim() ||
            password.length < 6 ||
            (signingUp && username.trim().length < 3) ||
            loading) &&
            styles.disabled,
        ]}
        disabled={
          !email.trim() ||
          password.length < 6 ||
          (signingUp && username.trim().length < 3) ||
          loading
        }
        onPress={() => void submit()}
      >
        <Text style={styles.primaryText}>
          {loading ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
        </Text>
      </Pressable>
      <Pressable
        style={styles.textButton}
        onPress={() => setSigningUp((value) => !value)}
      >
        <Text style={styles.textButtonLabel}>
          {signingUp
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function AuthGate({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<"sign_in" | "sign_up" | "reset">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const usernameValid = /^[a-z0-9_]{3,30}$/.test(username);
  const submit = async () => {
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: "around://reset-password" },
        );
        if (error) throw error;
        setNotice(
          "If that email has an account, we sent password-reset instructions.",
        );
      } else if (mode === "sign_up") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { username, display_name: username } },
        });
        if (error) throw error;
        setNotice(
          data.session
            ? "Account created. You are signed in."
            : "Check your email to confirm your account, then sign in.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  const canSubmit =
    email.includes("@") &&
    (mode === "reset" || password.length >= 6) &&
    (mode !== "sign_up" || usernameValid);
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.createForm}>
      <Pressable onPress={onBack}>
        <View style={styles.backRow}><UntitledIcon name="arrowLeft" size={18} color={colors.accent} /><Text style={styles.back}>Back to map</Text></View>
      </Pressable>
      <Text style={styles.screenTitle}>
        {mode === "sign_up"
          ? "Create account"
          : mode === "reset"
            ? "Reset password"
            : "Welcome back"}
      </Text>
      <Text style={styles.lead}>
        {mode === "sign_up"
          ? "Create an account to post, follow people, and save places."
          : mode === "reset"
            ? "We will email you a secure password-reset link."
            : "Sign in to publish and manage your Around profile."}
      </Text>
      {mode === "sign_up" && (
        <>
          <TextInput
            value={username}
            onChangeText={(value) => setUsername(value.toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Username — lowercase, 3–30 characters"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          {username.length > 0 && !usernameValid && (
            <Text style={styles.formError}>
              Use lowercase letters, numbers, or underscores.
            </Text>
          )}
        </>
      )}
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email address"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      {mode !== "reset" && (
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === "sign_up" ? "new-password" : "password"}
          placeholder="Password — at least 6 characters"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
      )}{" "}
      {notice && <Text style={styles.formNotice}>{notice}</Text>}
      <Pressable
        style={[styles.primary, (!canSubmit || loading) && styles.disabled]}
        disabled={!canSubmit || loading}
        onPress={() => void submit()}
      >
        <Text style={styles.primaryText}>
          {loading
            ? "Please wait…"
            : mode === "sign_up"
              ? "Create account"
              : mode === "reset"
                ? "Send reset email"
                : "Sign in"}
        </Text>
      </Pressable>
      {mode === "sign_in" && (
        <Pressable style={styles.textButton} onPress={() => setMode("reset")}>
          <Text style={styles.textButtonLabel}>Forgot password?</Text>
        </Pressable>
      )}
      <Pressable
        style={styles.textButton}
        onPress={() => setMode(mode === "sign_up" ? "sign_in" : "sign_up")}
      >
        <Text style={styles.textButtonLabel}>
          {mode === "sign_up"
            ? "Already have an account? Sign in"
            : "New to Around? Create account"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function AccountProfile({
  profile,
  email,
  saved,
  onLogout,
}: {
  profile: Profile | null;
  email: string;
  saved: number;
  onLogout: () => void;
}) {
  const name = profile?.display_name || "Your profile";
  const handle = profile?.username ? `@${profile.username}` : email;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.profile}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <Text style={styles.profileName}>{name}</Text>
      <Text style={styles.profileHandle}>{handle}</Text>
      {profile?.bio ? (
        <Text style={styles.profileBio}>{profile.bio}</Text>
      ) : (
        <Text style={styles.profileBio}>
          Welcome to Around. Share what is happening nearby.
        </Text>
      )}
      <View style={styles.stats}>
        <Stat value="0" label="Followers" />
        <Stat value="0" label="Following" />
        <Stat value={String(saved)} label="Saved" />
      </View>
      <Pressable
        style={styles.outline}
        onPress={() =>
          Alert.alert(
            "Profile editing",
            "Profile editing is the next social feature to connect.",
          )
        }
      >
        <Text style={styles.outlineText}>Edit profile</Text>
      </Pressable>
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.settings}>
        <Text>Email</Text>
        <Text style={styles.muted}>{email}</Text>
      </View>
      <View style={styles.settings}>
        <Text>Notifications</Text>
        <Text style={styles.muted}>On</Text>
      </View>
      <View style={styles.settings}>
        <Text>Location & privacy</Text>
        <UntitledIcon name="chevronRight" size={18} color={colors.muted} />
      </View>
      <Pressable onPress={onLogout}>
        <Text style={styles.logOut}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

function ExploreScreen({
  items,
  onOpen,
}: {
  items: ContentItem[];
  onOpen: (item: ContentItem) => void;
}) {
  const [query, setQuery] = useState("");
  const results = items.filter((item) =>
    `${item.title} ${item.description} ${item.author}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <View style={styles.page}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Explore</Text>
        <Text style={styles.muted}>Find your next local favourite</Text>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search people, posts or events"
        placeholderTextColor={colors.muted}
        style={styles.exploreSearch}
      />
      <FlatList
        data={results}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.resultList}
        renderItem={({ item }) => (
          <Pressable style={styles.result} onPress={() => onOpen(item)}>
            <View style={styles.resultIcon}>
              <UntitledIcon name={item.type === "event" ? "calendar" : "message"} size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultTitle}>{item.title}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {item.locationName} · {formatDistance(item.distanceM)}
              </Text>
            </View>
            <UntitledIcon name="chevronRight" size={18} color={colors.muted} />
          </Pressable>
        )}
      />
    </View>
  );
}

function ProfileScreen({ saved }: { saved: number }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.profile}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>A</Text>
      </View>
      <Text style={styles.profileName}>Around Explorer</Text>
      <Text style={styles.profileHandle}>@arounddemo</Text>
      <Text style={styles.profileBio}>
        Finding the good stuff, one neighbourhood at a time.
      </Text>
      <View style={styles.stats}>
        <Stat value="128" label="Followers" />
        <Stat value="84" label="Following" />
        <Stat value={String(saved)} label="Saved" />
      </View>
      <Pressable style={styles.outline}>
        <Text style={styles.outlineText}>Edit profile</Text>
      </Pressable>
      <Text style={styles.sectionTitle}>Your activity</Text>
      <View style={styles.settings}>
        <Text>Live posts</Text>
        <Text style={styles.muted}>0</Text>
      </View>
      <View style={styles.settings}>
        <Text>Created events</Text>
        <Text style={styles.muted}>0</Text>
      </View>
      <View style={styles.settings}>
        <Text>Notifications</Text>
        <Text style={styles.muted}>On</Text>
      </View>
      <View style={styles.settings}>
        <Text>Location & privacy</Text>
        <UntitledIcon name="chevronRight" size={18} color={colors.muted} />
      </View>
      <Pressable
        onPress={() =>
          Alert.alert(
            "Signed out",
            "Connect Supabase to enable account sessions.",
          )
        }
      >
        <Text style={styles.logOut}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function BottomNav({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  const entries = [
    { tab: "Map" as const, label: "Map", icon: "map" as const },
    { tab: "Feed" as const, label: "Feed", icon: "feed" as const },
    { tab: "Create" as const, label: "Create", icon: "plus" as const },
    {
      tab: "Explore" as const,
      label: "Explore",
      icon: "search" as const,
    },
    { tab: "Profile" as const, label: "Me", icon: "user" as const },
  ];
  return (
    <View style={styles.navContainer}>
      <BlurView intensity={56} tint="light" style={styles.nav}>
        {entries.map(({ tab, label, icon }) => (
          <Pressable
            key={tab}
            style={styles.navItem}
            onPress={() => onChange(tab)}
          >
            <View
              style={[
                styles.navItemInner,
                active === tab && styles.navItemActive,
              ]}
            >
              <UntitledIcon name={icon} size={23} color={active === tab ? colors.accent : colors.muted} />
              <Text
                style={[styles.navLabel, active === tab && styles.navActive]}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        ))}
      </BlurView>
    </View>
  );
}
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}
function DetailSheet({
  item,
  liked,
  saved,
  onClose,
  onLike,
  onSave,
}: {
  item: ContentItem | null;
  liked: Set<string>;
  saved: Set<string>;
  onClose: () => void;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
}) {
  if (!item) return null;
  const status =
    item.type === "event" ? eventStatus(item.startAt, item.endAt) : "LIVE";
  return (
    <View style={styles.detailWrap}>
      <View style={styles.handle} />
      <View style={styles.detailTop}>
        <Text style={styles.categoryPill}>
          {status === "live" ? "LIVE NOW" : item.type.toUpperCase()}
        </Text>
        <Pressable onPress={onClose}>
          <UntitledIcon name="close" size={23} color={colors.ink} />
        </Pressable>
      </View>
      <Text style={styles.detailTitle}>{item.title}</Text>
      <Text style={styles.detailMeta}>
        {item.author} · {item.locationName} · {formatDistance(item.distanceM)}
      </Text>
      <Text style={styles.detailBody}>{item.description}</Text>
      <View style={styles.detailActions}>
        <Pressable style={styles.detailAction} onPress={() => onLike(item.id)}>
          <View style={styles.iconTextRow}><UntitledIcon name="heart" size={18} color={liked.has(item.id) ? colors.coral : colors.muted} /><Text style={liked.has(item.id) ? styles.actionActive : styles.action}>{item.likes + (liked.has(item.id) ? 1 : 0)}</Text></View>
        </Pressable>
        <Pressable style={styles.detailAction} onPress={() => onSave(item.id)}>
          <View style={styles.iconTextRow}><UntitledIcon name="bookmark" size={18} color={saved.has(item.id) ? colors.accent : colors.muted} /><Text style={saved.has(item.id) ? styles.actionActive : styles.action}>Save</Text></View>
        </Pressable>
        <Pressable
          style={styles.detailAction}
          onPress={() =>
            Alert.alert(
              "Report submitted",
              "Thank you. Our team will review this content.",
            )
          }
        >
          <UntitledIcon name="more" size={20} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  page: { flex: 1, backgroundColor: colors.paper },
  onboard: { padding: 24, justifyContent: "space-between" },
  logo: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoMark: { color: colors.accent, fontSize: 24 },
  logoType: { fontSize: 26, fontWeight: "800", color: colors.ink },
  onboardBody: { marginTop: 70 },
  eyebrow: { color: colors.accent, fontWeight: "800", letterSpacing: 1.2 },
  hero: {
    fontSize: 43,
    lineHeight: 49,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: colors.ink,
    marginTop: 17,
  },
  lead: { fontSize: 17, lineHeight: 26, color: colors.muted, marginTop: 17 },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
    marginTop: 16,
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  textButton: { alignItems: "center", padding: 18 },
  textButtonLabel: { color: colors.muted, fontWeight: "700" },
  mapCanvas: { flex: 1, backgroundColor: "#dce8dc", overflow: "hidden" },
  mapGrid: {
    ...StyleSheet.absoluteFill,
    opacity: 0.38,
    backgroundColor: "#c5d8c5",
    borderWidth: 1,
    borderColor: "#afc6af",
  },
  mapHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    flexDirection: "row",
    gap: 9,
  },
  search: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
  },
  searchText: { color: colors.muted },
  iconButton: {
    width: 47,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
  },
  mapLabel: { position: "absolute", top: "43%", alignSelf: "center" },
  mapLabelTitle: { fontSize: 26, color: "#668266", fontWeight: "800" },
  mapLabelSub: { textAlign: "center", color: "#789278" },
  marker: {
    position: "absolute",
    width: 39,
    height: 39,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 3,
    borderColor: "#fff",
  },
  markerText: { color: "#fff", fontWeight: "800" },
  recenter: {
    position: "absolute",
    right: 28,
    bottom: 118,
    backgroundColor: "#fff",
    height: 46,
    width: 46,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 23,
  },
  permission: {
    position: "absolute",
    bottom: 118,
    left: 18,
    backgroundColor: colors.ink,
    borderRadius: 10,
    padding: 10,
  },
  permissionText: { color: "#fff", fontSize: 12 },
  nearby: {
    paddingBottom: 91,
    backgroundColor: "#fff",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
  },
  nearbyExpanded: { minHeight: 260 },
  nearbyHeader: {
    width: "100%",
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nearbyList: { paddingHorizontal: 18, gap: 4 },
  nearbyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  nearbyPin: {
    height: 32,
    width: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pale,
  },
  nearbyCopy: { flex: 1 },
  nearbyTitle: { color: colors.ink, fontWeight: "800", marginBottom: 3 },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.ink,
    marginTop: 17,
    marginBottom: 8,
  },
  muted: { color: colors.muted, fontSize: 13 },
  chevron: { fontSize: 25, color: colors.muted },
  navContainer: {
    height: 72,
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 28,
    borderRadius: 36,
    overflow: "hidden",
  },
  nav: {
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.48)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.86)",
    borderRadius: 36,
    flexDirection: "row",
    justifyContent: "space-around",
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  navItemInner: {
    width: "100%",
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  navItemActive: { backgroundColor: "rgba(37,108,77,0.14)" },
  navLabel: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 3,
    fontWeight: "700",
  },
  navActive: { color: colors.accent, fontWeight: "800" },
  screenHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
  screenTitle: {
    fontSize: 29,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.7,
  },
  feed: { padding: 16, paddingBottom: 92, gap: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryPill: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  cardTime: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    marginTop: 10,
  },
  cardBody: { fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 6 },
  locationRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    color: colors.muted,
  },
  iconTextRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { color: colors.muted },
  actions: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 14,
    paddingTop: 12,
    flexDirection: "row",
    gap: 18,
  },
  action: { color: colors.muted, fontWeight: "700" },
  actionActive: { color: colors.coral, fontWeight: "800" },
  createChooser: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    paddingBottom: 110,
  },
  choice: {
    marginTop: 18,
    padding: 20,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  choiceTitle: {
    fontWeight: "800",
    fontSize: 17,
    color: colors.ink,
    marginBottom: 4,
  },
  createForm: { padding: 20, paddingBottom: 105 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 18 },
  back: { color: colors.accent, fontWeight: "800" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 15,
    borderRadius: 13,
    fontSize: 16,
    color: colors.ink,
    marginTop: 18,
  },
  textarea: { minHeight: 110, textAlignVertical: "top", marginTop: 11 },
  fieldLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 22,
    marginBottom: 9,
  },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.pale, borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: colors.accent },
  locationPicker: {
    backgroundColor: colors.surface,
    borderRadius: 13,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 17,
  },
  locationSelected: { color: colors.ink, fontWeight: "800", marginBottom: 5 },
  disabled: { opacity: 0.38 },
  exploreSearch: {
    marginHorizontal: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    padding: 14,
    fontSize: 15,
  },
  resultList: { padding: 20, paddingTop: 5, paddingBottom: 93 },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  resultIcon: {
    height: 42,
    width: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.pale,
  },
  resultTitle: { fontWeight: "800", color: colors.ink, marginBottom: 4 },
  profile: { alignItems: "center", padding: 22, paddingBottom: 100 },
  avatar: {
    height: 76,
    width: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  avatarText: { color: "#fff", fontSize: 28, fontWeight: "800" },
  profileName: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: "800",
    marginTop: 12,
  },
  profileHandle: { color: colors.muted, marginTop: 3 },
  profileBio: {
    color: colors.muted,
    marginTop: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  stats: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 24,
  },
  statValue: {
    textAlign: "center",
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 3 },
  outline: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 13,
    alignItems: "center",
    padding: 12,
  },
  outlineText: { color: colors.accent, fontWeight: "800" },
  settings: {
    width: "100%",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    justifyContent: "space-between",
    color: colors.ink,
  },
  logOut: {
    color: colors.coral,
    fontWeight: "800",
    alignSelf: "flex-start",
    marginTop: 27,
  },
  detailWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    paddingBottom: 86,
  },
  handle: {
    width: 42,
    height: 4,
    backgroundColor: colors.line,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 15,
  },
  detailTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  close: { fontSize: 26, color: colors.muted },
  detailTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: colors.ink,
    marginTop: 10,
  },
  detailMeta: { color: colors.muted, marginTop: 6 },
  detailBody: { color: colors.ink, lineHeight: 21, marginTop: 15 },
  detailActions: { flexDirection: "row", gap: 9, marginTop: 18 },
  detailAction: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: 12,
    borderRadius: 11,
    alignItems: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.28)",
    justifyContent: "flex-end",
  },
  filterSheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    paddingBottom: 30,
  },
  sheetTitle: { fontSize: 24, color: colors.ink, fontWeight: "800" },
  formError: { color: colors.coral, fontSize: 12, marginTop: 8 },
  formNotice: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
});

export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <App />
    </QueryClientProvider>
  );
}
