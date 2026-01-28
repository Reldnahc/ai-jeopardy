import React, { useState } from "react";
import {supabase} from "../../supabaseClient";
import {useNavigate} from "react-router-dom";
import Avatar from "../common/Avatar.tsx";

// Define the expected shape of the profiles table
interface Profile {
    username: string; // The username field from your Supabase table
    displayname: string;
    color: string;
    text_color: string;
    // Add additional fields if required
}

const PlayerSearch: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState(""); // State for search query
    const [matchingUsers, setMatchingUsers] = useState<Profile[]>([]); // Array of profiles
    const [isDropdownVisible, setIsDropdownVisible] = useState(false); // Dropdown visibility
    const navigate = useNavigate();

    const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);

        if (query.trim() === "") {
            setMatchingUsers([]);
            setIsDropdownVisible(false);
            return;
        }

        const { data, error } = await supabase
            .from("profiles")
            .select(`
            username,
            displayname,
            user_profiles (color, text_color)
            `) // Fetch rows from both `profiles` and related `user_profiles`
            .ilike("username", `%${query}%`)// Case-insensitive username matching
            .limit(5);

        if (error) {
            console.error("Error fetching matching users:", error.message);
        } else if (data){
            console.log(data);
            const transformedData = data.map((user) => ({
                username: user.username,
                displayname: user.displayname,
                // @ts-expect-error test
                color: user.user_profiles?.color, // Take `color` from the first `user_profiles` entry, or default to an empty string
                // @ts-expect-error test
                text_color: user.user_profiles?.text_color, // Likewise for `text_color`
            }));

            setMatchingUsers(transformedData); // Ensure we have a valid array (if data is null, default to [])
            setIsDropdownVisible(true); // Show dropdown if there are results
        }
    };

    const handleUserSelect = (username: string) => {
        //setSearchQuery(username); // Set the input value to the selected username
        setIsDropdownVisible(false); // Hide the dropdown
        navigate(`profile/${username}`);
    };

    return (
        <div className="relative w-full">
            <label className="block text-2xl font-semibold text-gray-700 mb-2" htmlFor="player-search">
                Search for a Player
            </label>
            <input
                type="text"
                id="player-search"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Start typing a username..."
                className="w-full p-3 border border-gray-300 text-black rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {isDropdownVisible && matchingUsers.length > 0 && (
                <ul className="absolute w-full mt-2 bg-white border border-gray-300 rounded shadow-lg z-10">
                    {matchingUsers.map((user, index) => (
                        <li
                            key={index}
                            className="p-3 hover:bg-blue-100 cursor-pointer text-black flex items-center space-x-3"
                            style={{ minHeight: "3rem" }} // Ensures enough height for the Avatar
                            onClick={() => handleUserSelect(user.username)}
                        >
                            <Avatar
                                size={"8"}
                                name={user.username}
                                color={user.color}
                                textColor={user.text_color}
                            />
                            <span className="whitespace-nowrap">{user.displayname}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default PlayerSearch;