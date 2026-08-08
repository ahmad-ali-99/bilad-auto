<?php
/**
 * قالب الصفحات العادية
 *
 * @package BiladAuto
 */

get_header();

while ( have_posts() ) :
	the_post();
	?>

	<header class="page-header">
		<div class="container">
			<h1 class="page-title"><?php the_title(); ?></h1>
		</div>
	</header>

	<section class="section">
		<div class="container">
			<?php if ( has_post_thumbnail() ) : ?>
				<div class="page-featured-img fade-in"><?php the_post_thumbnail( 'full' ); ?></div>
			<?php endif; ?>
			<div class="single-content fade-in">
				<?php
				the_content();
				wp_link_pages( array( 'before' => '<div class="page-links">', 'after' => '</div>' ) );
				?>
			</div>
		</div>
	</section>

	<?php
endwhile;

get_footer();
