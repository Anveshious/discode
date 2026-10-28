export class GitHubService {

    async getCurrentUser(token: string) {
        const response = await fetch("https://api.github.com/user",
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    const user = await response.json();

    console.log(user);

    }

}