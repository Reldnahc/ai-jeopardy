import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import {supabase} from "../supabaseClient";
import {useAuth} from "./AuthContext.tsx";

// Define the shape of the data you expect from the "profiles" table
export interface UserProfile {
    id: string;
    color: string;
    text_color: string;
}

// Context value type definition
interface UserProfileContextType {
    userProfile: UserProfile | null;
    loading: boolean;
    error: string | null;
    refetchProfile: () => Promise<void>; // Function to refetch profile
    updateColor: (newColor: string, table: string) => Promise<void>; // Function to update the user's colo
}

// Default value for the context
const UserProfileContext = createContext<UserProfileContextType>({
    userProfile: null,
    loading: true,
    error: null,
    refetchProfile: async () => {},
    updateColor: async () => {},
});

// Context Provider Component
export const UserProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [userProfileLoading, setUserProfileLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user, loading } = useAuth();

    // Fetch the profile from Supabase
    const fetchProfile = async () => {
        try {
            setUserProfileLoading(true);

            if (user) {
                const { data, error } = await supabase
                    .from('user_profiles') // Replace with your table name
                    .select('*') // Select all columns or limit as needed (e.g., 'id, username, role')
                    .eq('id', user.id)
                    .single();
                if (error) {
                    throw new Error(error.message);
                }
                setUserProfile(data); // Set the profile in state
            } else {
                setUserProfile(null);
            }
        } catch (err: any) {
            console.error('Error fetching profile:', err.message);
            setError(err.message);
        } finally {
            setUserProfileLoading(false);
        }
    };

    const updateColor = async (newColor: string, table: string) => {
        if (!user) {
            console.error('No user logged in, cannot update color');
            return;
        }

        try {
            // Update color in the database
            const { error } = await supabase
                .from('user_profiles')
                .update({[table]: newColor })
                .eq('id', user.id);

            if (error) throw new Error(error.message);

            // Update the context state with the new color
            setUserProfile((prev) => prev ? { ...prev, [table]: newColor } : null);
        } catch (err: any) {
            console.error('Error updating color:', err.message);
            setError(err.message);
        }
    };


    // Fetch the profile on component mount
    useEffect(() => {
        fetchProfile();
    }, [user, loading]);

    // Provide the context value
    return (
        <UserProfileContext.Provider
            value={{
                userProfile: userProfile,
                loading: userProfileLoading,
                error,
                refetchProfile: fetchProfile, // Allow re-fetching
                updateColor,
            }}
        >
            {children}
        </UserProfileContext.Provider>
    );
};

// Custom Hook to Use the Profile Context
export const useUserProfile = () => {
    const context = useContext(UserProfileContext);

    if (!context) {
        throw new Error('useProfile must be used within a ProfileProvider');
    }

    return context;
};