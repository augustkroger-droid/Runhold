# GPS Domain

GPS input must stay separate from gameplay UI.

The expedition engine should eventually be able to consume the same position sample
shape from either:

- live phone GPS
- imported routes from watches or external services

Collection, distance calculation, and expedition results should therefore operate
on timestamped position samples instead of depending directly on an active map view.
