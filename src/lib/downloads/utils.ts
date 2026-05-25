export const matchFileToEpisode = (
    fileName: string,
    seasonNum: number,
    episodeNum: number
): boolean => {
    const cleanName = fileName.toLowerCase();
    const sPattern = new RegExp(`s0?${seasonNum}e0?${episodeNum}\\b`);
    const xPattern = new RegExp(`\\b${seasonNum}x0?${episodeNum}\\b`);
    const spacePattern = new RegExp(`\\bseason\\s*0?${seasonNum}\\s*episode\\s*0?${episodeNum}\\b`);
    const shortPattern = new RegExp(`\\b${seasonNum}e0?${episodeNum}\\b`);

    return (
        sPattern.test(cleanName) ||
        xPattern.test(cleanName) ||
        spacePattern.test(cleanName) ||
        shortPattern.test(cleanName)
    );
};
