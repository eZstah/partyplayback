// Operator details for the Impressum. The page and its footer link stay
// hidden until name and address are filled in, so no placeholder ever goes live.
export const IMPRESSUM = {
  name: "",
  street: "",
  postalCodeAndCity: "",
  country: "",
  email: "xiseah@googlemail.com",
};

export const CONTACT_EMAIL = IMPRESSUM.email;

export function impressumReady(details = IMPRESSUM) {
  return Boolean(details.name.trim() && details.street.trim() && details.postalCodeAndCity.trim() && details.email.trim());
}
