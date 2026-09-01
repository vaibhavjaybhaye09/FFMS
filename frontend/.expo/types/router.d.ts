/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/driver-profile`; params?: Router.UnknownInputParams; } | { pathname: `/driver`; params?: Router.UnknownInputParams; } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/operator-profile`; params?: Router.UnknownInputParams; } | { pathname: `/operator`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/driver-profile`; params?: Router.UnknownOutputParams; } | { pathname: `/driver`; params?: Router.UnknownOutputParams; } | { pathname: `/`; params?: Router.UnknownOutputParams; } | { pathname: `/operator-profile`; params?: Router.UnknownOutputParams; } | { pathname: `/operator`; params?: Router.UnknownOutputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; };
      href: Router.RelativePathString | Router.ExternalPathString | `/driver-profile${`?${string}` | `#${string}` | ''}` | `/driver${`?${string}` | `#${string}` | ''}` | `/${`?${string}` | `#${string}` | ''}` | `/operator-profile${`?${string}` | `#${string}` | ''}` | `/operator${`?${string}` | `#${string}` | ''}` | `/_sitemap${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/driver-profile`; params?: Router.UnknownInputParams; } | { pathname: `/driver`; params?: Router.UnknownInputParams; } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/operator-profile`; params?: Router.UnknownInputParams; } | { pathname: `/operator`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; };
    }
  }
}
