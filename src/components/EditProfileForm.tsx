import React, { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Upload, Camera } from 'lucide-react';
import { NSchema as n, type NostrMetadata } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';
import { useUploadFile } from '@/hooks/useUploadFile';
import { genUserName } from '@/lib/genUserName';

export const EditProfileForm: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, metadata } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<NostrMetadata>({
    resolver: zodResolver(n.metadata()),
    defaultValues: {
      display_name: '',
      name: '',
      about: '',
      picture: '',
      banner: '',
      website: '',
      nip05: '',
      bot: false,
    },
  });

  useEffect(() => {
    if (metadata) {
      form.reset({
        display_name: metadata.display_name || '',
        name: metadata.name || '',
        about: metadata.about || '',
        picture: metadata.picture || '',
        banner: metadata.banner || '',
        website: metadata.website || '',
        nip05: metadata.nip05 || '',
        bot: metadata.bot || false,
      });
    }
  }, [metadata, form]);

  const handleUpload = async (file: File, field: 'picture' | 'banner') => {
    try {
      const [[_, url]] = await uploadFile(file);
      form.setValue(field, url);
      toast({
        title: 'Uploaded',
        description: `${field === 'picture' ? 'Profile picture' : 'Banner'} uploaded.`,
      });
    } catch (error) {
      console.error(`Failed to upload ${field}:`, error);
      toast({
        title: 'Upload failed',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const onSubmit = async (values: NostrMetadata) => {
    if (!user) return;

    try {
      const data = { ...metadata, ...values };
      for (const key in data) {
        if (data[key] === '') delete data[key];
      }

      await publishEvent({ kind: 0, content: JSON.stringify(data) });

      queryClient.invalidateQueries({ queryKey: ['logins'] });
      queryClient.invalidateQueries({ queryKey: ['author', user.pubkey] });

      toast({ title: 'Profile updated' });
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile.',
        variant: 'destructive',
      });
    }
  };

  const watchPicture = form.watch('picture');
  const watchBanner = form.watch('banner');
  const displayName = metadata?.display_name || metadata?.name || (user ? genUserName(user.pubkey) : '');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Banner + Avatar visual header */}
        <div className="rounded-xl overflow-hidden border bg-card">
          {/* Banner */}
          <div
            className="aspect-[3/1] bg-muted relative cursor-pointer group overflow-hidden"
            onClick={() => bannerInputRef.current?.click()}
          >
            {watchBanner ? (
              <img src={watchBanner} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <input
              type="file"
              ref={bannerInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file, 'banner');
              }}
            />
          </div>

          {/* Avatar + name below banner */}
          <div className="px-5 py-4 flex items-center gap-4">
            <div
              className="relative cursor-pointer group shrink-0"
              onClick={() => avatarInputRef.current?.click()}
            >
              <Avatar className="w-16 h-16 border-2 border-border">
                <AvatarImage src={watchPicture} alt={displayName} />
                <AvatarFallback className="text-xl bg-muted">{displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <Camera className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <input
                type="file"
                ref={avatarInputRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file, 'picture');
                }}
              />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-lg truncate">{displayName}</p>
              {metadata?.nip05 && (
                <p className="text-sm text-muted-foreground truncate">{metadata.nip05}</p>
              )}
            </div>
          </div>
        </div>

        {/* Basic Info Section */}
        <fieldset className="space-y-4 rounded-xl border bg-card p-5">
          <legend className="text-sm font-medium text-muted-foreground px-1">Basic Info</legend>

          <FormField
            control={form.control}
            name="display_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Testing Tony" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. testingtony" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="about"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bio</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Tell others about yourself"
                    className="resize-none min-h-[80px]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Images Section */}
        <fieldset className="space-y-4 rounded-xl border bg-card p-5">
          <legend className="text-sm font-medium text-muted-foreground px-1">Images</legend>

          <FormField
            control={form.control}
            name="picture"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profile Picture URL</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      placeholder="https://..."
                      name={field.name}
                      value={field.value ?? ''}
                      onChange={e => field.onChange(e.target.value)}
                      onBlur={field.onBlur}
                      className="flex-1"
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="banner"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Banner Image URL</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      placeholder="https://..."
                      name={field.name}
                      value={field.value ?? ''}
                      onChange={e => field.onChange(e.target.value)}
                      onBlur={field.onBlur}
                      className="flex-1"
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Links & Verification */}
        <fieldset className="space-y-4 rounded-xl border bg-card p-5">
          <legend className="text-sm font-medium text-muted-foreground px-1">Links & Verification</legend>

          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <Input placeholder="https://yourwebsite.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nip05"
            render={({ field }) => (
              <FormItem>
                <FormLabel>NIP-05 Identifier</FormLabel>
                <FormControl>
                  <Input placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Advanced */}
        <fieldset className="rounded-xl border bg-card p-5">
          <legend className="text-sm font-medium text-muted-foreground px-1">Advanced</legend>

          <FormField
            control={form.control}
            name="bot"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between">
                <div className="space-y-0.5">
                  <FormLabel>Bot Account</FormLabel>
                  <p className="text-sm text-muted-foreground">Mark this as an automated account.</p>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </fieldset>

        <Button
          type="submit"
          className="w-full"
          disabled={isPending || isUploading}
        >
          {(isPending || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Profile
        </Button>
      </form>
    </Form>
  );
};
