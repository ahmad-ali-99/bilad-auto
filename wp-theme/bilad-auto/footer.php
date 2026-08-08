<?php
/**
 * تذييل الصفحة
 *
 * @package BiladAuto
 */
?>
</main><!-- #main -->

<footer class="main-footer">
	<div class="container">
		<div class="footer-grid">

			<div class="footer-brand">
				<span class="footer-logo-text"><?php bloginfo( 'name' ); ?></span>
				<p><?php echo esc_html( get_theme_mod( 'bilad_hero_sub', 'الطاقة الشمسية التي تضيء بيتك كل ليلة' ) ); ?></p>
			</div>

			<div class="footer-links">
				<h4><?php esc_html_e( 'الصفحات', 'bilad-auto' ); ?></h4>
				<?php
				wp_nav_menu(
					array(
						'theme_location' => 'footer',
						'container'      => false,
						'menu_class'     => 'footer-menu',
						'fallback_cb'    => function () {
							echo '<ul class="footer-menu">';
							echo '<li><a href="' . esc_url( home_url( '/' ) ) . '">' . esc_html__( 'الرئيسية', 'bilad-auto' ) . '</a></li>';
							echo '<li><a href="' . esc_url( home_url( '/projects/' ) ) . '">' . esc_html__( 'المشاريع', 'bilad-auto' ) . '</a></li>';
							echo '<li><a href="' . esc_url( home_url( '/services/' ) ) . '">' . esc_html__( 'الخدمات', 'bilad-auto' ) . '</a></li>';
							echo '<li><a href="' . esc_url( home_url( '/about/' ) ) . '">' . esc_html__( 'من نحن', 'bilad-auto' ) . '</a></li>';
							echo '<li><a href="' . esc_url( home_url( '/contact/' ) ) . '">' . esc_html__( 'التواصل', 'bilad-auto' ) . '</a></li>';
							echo '</ul>';
						},
						'depth'          => 1,
					)
				);
				?>
			</div>

			<div class="footer-contact">
				<h4><?php esc_html_e( 'تواصل معنا', 'bilad-auto' ); ?></h4>

				<a href="<?php echo esc_url( bilad_whatsapp_url() ); ?>" class="footer-whatsapp" target="_blank" rel="noopener">
					<?php echo bilad_whatsapp_icon( 18 ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
					<span><?php echo esc_html( get_theme_mod( 'bilad_phone', '+964 771 234 5678' ) ); ?></span>
				</a>

				<?php $email = get_theme_mod( 'bilad_email', 'info@biladauto.iq' ); ?>
				<?php if ( $email ) : ?>
					<a href="mailto:<?php echo esc_attr( $email ); ?>" class="footer-email"><?php echo esc_html( $email ); ?></a>
				<?php endif; ?>

				<p class="footer-address"><?php echo esc_html( get_theme_mod( 'bilad_address', 'بغداد، العراق' ) ); ?></p>
				<p class="footer-hours"><?php echo esc_html( get_theme_mod( 'bilad_hours', 'السبت – الخميس، 9 صباحاً – 6 مساءً' ) ); ?></p>
			</div>

		</div><!-- /footer-grid -->

		<div class="footer-bottom">
			<p>
				&copy; <?php echo esc_html( gmdate( 'Y' ) ); ?> <?php bloginfo( 'name' ); ?>.
				<?php esc_html_e( 'جميع الحقوق محفوظة.', 'bilad-auto' ); ?>
			</p>
		</div>
	</div>
</footer>

<?php wp_footer(); ?>
</body>
</html>
