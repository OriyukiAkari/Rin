import { t } from "i18next";
import { useEffect, useState } from "react";
import { Icon } from "@rin/ui";
import { client, oauth_url } from "../app/runtime";

export function LoginPage() {
    const [githubEnabled, setGitHubEnabled] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        client.auth.status()
            .then(({ data }) => setGitHubEnabled(Boolean(data?.github)))
            .finally(() => setLoaded(true));
    }, []);

    return (
        <div className="flex items-center justify-center my-8">
            <div className="bg-w w-full max-w-md flex flex-col items-center justify-between p-8 space-y-4 t-primary rounded-2xl shadow-lg">
                <p className="text-2xl font-bold">{t('login.title')}</p>
                {githubEnabled ? (
                    <>
                        <p className="text-sm t-secondary text-center">{t('login.creator_only')}</p>
                        <Icon
                            label={t('github_login')}
                            name="ri-github-line"
                            onClick={() => { window.location.href = oauth_url; }}
                            hover={true}
                        />
                    </>
                ) : loaded ? (
                    <p className="text-sm text-red-500">{t('login.no_methods')}</p>
                ) : (
                    <p className="text-sm t-secondary">{t('login.loading')}</p>
                )}
            </div>
        </div>
    );
}
