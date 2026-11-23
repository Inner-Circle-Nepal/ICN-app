import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import type { ModerationAction } from "@/lib/api/chautari";
import type { RoomMember } from "@/features/chautari/useChautariRoom";
import { useProfile } from "@/features/profile/useProfile";
import {
  useFollowMutation,
  useFollowStatus,
  useUnfollowMutation,
} from "@/features/profile/useFollow";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import type { ReportReasonId } from "@/features/reports/reasons";
import { ActionRow, type ActionRowProps } from "./ActionRow";
import { ReportForm } from "./ReportForm";
import { Avatar } from "./Avatar";
import { BottomSheet } from "./BottomSheet";
import { FollowAlertPrompt } from "@/components/FollowAlertPrompt";

/**
 * Everything you can do about one person in a Chautari room.
 *
 * Who they are on top (name, @handle, bio, follow, profile), then what the
 * host or a moderator can do to them, then what anyone can do: block or
 * report. Nobody gets controls over the host. A person
 * with no reader profile has no handle to follow or open, so those rows are
 * left out rather than shown disabled.
 */

type Row = ActionRowProps;

export function PersonSheet({
  member,
  viewerCanModerate,
  blocked,
  localImageUrl,
  onClose,
  onAct,
  onToggleBlock,
  onReport,
  onViewProfile,
}: {
  /** Null closes the sheet. */
  member: RoomMember | null;
  /** The viewer is the host or a moderator. */
  viewerCanModerate: boolean;
  blocked: boolean;
  localImageUrl: string | null;
  onClose: () => void;
  onAct: (member: RoomMember, action: ModerationAction) => void;
  onToggleBlock: (member: RoomMember) => void;
  onReport: (member: RoomMember, reason: ReportReasonId, details: string) => void;
  onViewProfile: (username: string) => void;
}) {
  const { palette } = useTheme();
  const [reporting, setReporting] = useState(false);
  // Right after following: ask about their Chautari rooms, in this sheet.
  const [askingAlerts, setAskingAlerts] = useState(false);

  const username = member?.username ?? undefined;
  const profileQuery = useProfile(username);
  const statusQuery = useFollowStatus(username);
  const follow = useFollowMutation();
  const unfollow = useUnfollowMutation();

  if (!member) return null;

  const close = () => {
    setReporting(false);
    setAskingAlerts(false);
    onClose();
  };
  // Every action closes the sheet first, so a confirm dialog or a navigation
  // never opens on top of it.
  const then = (fn: () => void) => () => {
    close();
    fn();
  };

  const roleTag = member.isHost ? "HOST" : member.isModerator ? "MODERATOR" : null;
  const status = statusQuery.data ?? null;
  const following = status?.is_following ?? false;
  const followBusy = follow.isPending || unfollow.isPending;
  const bio = profileQuery.data?.bio ?? null;

  const stageRows: Row[] = member.canPublish
    ? [
        { label: "Mute", onPress: then(() => onAct(member, "mute")) },
        {
          label: "Move to audience",
          onPress: then(() => onAct(member, "demote_speaker")),
        },
      ]
    : [
        {
          label: member.handRaised ? "Accept to stage" : "Invite to stage",
          onPress: then(() => onAct(member, "approve_speaker")),
        },
        ...(member.handRaised
          ? [{ label: "Decline request", onPress: then(() => onAct(member, "deny_speaker")) }]
          : []),
      ];

  const hostRows: Row[] =
    viewerCanModerate && !member.isLocal && !member.isHost
      ? [
          ...stageRows,
          member.isModerator
            ? {
                label: "Remove as moderator",
                onPress: then(() => onAct(member, "remove_moderator")),
              }
            : {
                label: "Make moderator",
                onPress: then(() => onAct(member, "make_moderator")),
              },
          { label: "Remove from room", danger: true, onPress: then(() => onAct(member, "remove")) },
        ]
      : [];

  const safetyRows: Row[] = member.isLocal
    ? []
    : [
        {
          label: blocked ? "Unblock" : "Block",
          danger: !blocked,
          onPress: then(() => onToggleBlock(member)),
        },
        { label: "Report", onPress: () => setReporting(true) },
      ];

  return (
    <BottomSheet visible onClose={close}>
        {askingAlerts && member.username ? (
          <FollowAlertPrompt
            name={member.name}
            username={member.username}
            onDone={() => setAskingAlerts(false)}
          />
        ) : reporting ? (
          <ReportForm
            heading={`Report ${member.name}`}
            question="Why are you reporting them?"
            onSubmit={(reason, details) => then(() => onReport(member, reason, details))()}
            onBack={() => setReporting(false)}
          />
        ) : (
          <>
            <View style={styles.identity}>
              <Avatar
                name={member.name}
                size="lg"
                imageUrl={member.avatarUrl ?? (member.isLocal ? localImageUrl : null)}
              />
              <View style={styles.identityText}>
                <Text style={[styles.name, { color: palette.ink }]} numberOfLines={2}>
                  {member.isLocal ? `${member.name} (you)` : member.name}
                </Text>
                {member.username ? (
                  <Text style={[styles.handle, { color: palette.quiet }]} numberOfLines={1}>
                    @{member.username}
                    {roleTag ? `  ·  ${roleTag}` : ""}
                  </Text>
                ) : roleTag ? (
                  <Text style={[styles.handle, { color: palette.quiet }]}>{roleTag}</Text>
                ) : null}
                {status && !member.isLocal ? (
                  <Text style={[styles.meta, { color: palette.quiet }]}>
                    {status.follower_count}{" "}
                    {status.follower_count === 1 ? "follower" : "followers"}
                  </Text>
                ) : null}
              </View>
            </View>

            {bio ? (
              <Text style={[styles.bio, { color: palette.ink2 }]} numberOfLines={3}>
                {bio}
              </Text>
            ) : null}

            {member.username ? (
              <View style={styles.buttons}>
                {!member.isLocal ? (
                  <Pressable
                    onPress={() => {
                      void Haptics.selectionAsync().catch(() => {});
                      if (following) unfollow.mutate(member.username!);
                      else
                        follow.mutate(member.username!, {
                          onSuccess: (res) => {
                            if (!res.already_following) setAskingAlerts(true);
                          },
                        });
                    }}
                    disabled={followBusy || !status}
                    accessibilityRole="button"
                    accessibilityLabel={following ? `Unfollow ${member.name}` : `Follow ${member.name}`}
                    style={({ pressed }) => [
                      styles.button,
                      {
                        borderColor: palette.ink,
                        backgroundColor: following ? "transparent" : palette.ink,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    {followBusy ? (
                      <ActivityIndicator
                        size="small"
                        color={following ? palette.ink : palette.paper}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.buttonText,
                          { color: following ? palette.ink : palette.paper },
                        ]}
                      >
                        {following ? "Following" : "Follow"}
                      </Text>
                    )}
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={then(() => onViewProfile(member.username!))}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${member.name}'s profile`}
                  style={({ pressed }) => [
                    styles.button,
                    { borderColor: palette.ink },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.buttonText, { color: palette.ink }]}>View profile</Text>
                </Pressable>
              </View>
            ) : null}

            {hostRows.length > 0 ? (
              <View style={[styles.rows, { borderTopColor: palette.rule }]}>
                {hostRows.map((r) => (
                  <ActionRow key={r.label} {...r} />
                ))}
              </View>
            ) : null}

            {safetyRows.length > 0 ? (
              <View style={[styles.rows, { borderTopColor: palette.rule }]}>
                {safetyRows.map((r) => (
                  <ActionRow key={r.label} {...r} />
                ))}
              </View>
            ) : null}
          </>
        )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  identityText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamilies.serifMedium, fontSize: 22, lineHeight: 27 },
  handle: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 0.4,
    marginTop: 3,
  },
  meta: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 3 },
  bio: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
  },
  buttons: { flexDirection: "row", gap: 10, marginTop: 18 },
  button: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  rows: { borderTopWidth: 1, marginTop: 18 },
  pressed: { opacity: 0.75 },
});
