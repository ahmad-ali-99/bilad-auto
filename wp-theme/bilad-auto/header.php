<?php
/**
 * رأس الصفحة
 *
 * @package BiladAuto
 */
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="profile" href="https://gmpg.org/xfn/11">
	<?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<a class="skip-link screen-reader-text" href="#main"><?php esc_html_e( 'تخطي إلى المحتوى', 'bilad-auto' ); ?></a>

<nav class="main-nav" id="main-nav">
	<div class="nav-container">

		<a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="nav-logo">
			<?php
			if ( has_custom_logo() ) {
				the_custom_logo();
			} else {
				echo bilad_sun_icon( 34 ); // phpcs:ignore WordPress.Security.EscapeOutput
				?>
				<span class="logo-ar"><?php bloginfo( 'name' ); ?></span>
				<?php
			}
			?>
		</a>

		<?php
		wp_nav_menu(
			array(
				'theme_location' => 'primary',
				'container'      => 'div',
				'container_class'=> 'nav-menu',
				'container_id'   => 'nav-menu',
				'menu_class'     => 'nav-menu-list',
				'fallback_cb'    => 'bilad_default_menu',
				'depth'          => 2,
			)
		);
		?>

		<a href="<?php echo esc_url( bilad_whatsapp_url() ); ?>" class="nav-cta" target="_blank" rel="noopener">
			<?php esc_html_e( 'عرض سعر', 'bilad-auto' ); ?>
		</a>

		<button id="hamburger" class="hamburger" aria-label="<?php esc_attr_e( 'القائمة', 'bilad-auto' ); ?>" aria-expanded="false">
			<span></span><span></span><span></span>
		</button>

	</div>
</nav>

<?php
/**
 * قائمة افتراضية إذا لم يتم إعداد قائمة
 */
function bilad_default_menu() {
	echo '<div class="nav-menu" id="nav-menu"><ul class="nav-menu-list">';
	echo '<li><a href="' . esc_url( home_url( '/' ) ) . '">' . esc_html__( 'الرئيسية', 'bilad-auto' ) . '</a></li>';
	echo '<li><a href="' . esc_url( home_url( '/projects/' ) ) . '">' . esc_html__( 'المشاريع', 'bilad-auto' ) . '</a></li>';
	echo '<li><a href="' . esc_url( home_url( '/services/' ) ) . '">' . esc_html__( 'الخدمات', 'bilad-auto' ) . '</a></li>';
	echo '<li><a href="' . esc_url( home_url( '/about/' ) ) . '">' . esc_html__( 'من نحن', 'bilad-auto' ) . '</a></li>';
	echo '<li><a href="' . esc_url( home_url( '/contact/' ) ) . '">' . esc_html__( 'التواصل', 'bilad-auto' ) . '</a></li>';
	echo '</ul></div>';
}
?>

<main id="main" class="site-main">
